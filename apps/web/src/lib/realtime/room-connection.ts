import {
  PROTOCOL_VERSION,
  clientCommandSchema,
  parseServerEventEnvelopeV1,
  recentWordIdsSchema,
  type ClientCommand,
  type CommandEnvelopeV1,
  type ErrorServerEvent,
  type JoinCommand,
  type ResumeCommand,
  type ServerEventEnvelopeV1,
} from '@drawing-games/protocol'

import * as identity from '../identity'
import { randomId } from '../random-id'
import { isRecordableWordId } from '../word-history'
import { reconnectDelayMs } from './backoff'
import {
  browserLifecycle,
  browserSeats,
  browserTimers,
  createBrowserSocket,
  defaultSocketUrl,
} from './browser-adapters'
import { RoomCommandError } from './command-error'
import type {
  AckStatus,
  ClientSeqStore,
  JoinParams,
  RoomCommand,
  RoomConnectionEvent,
  RoomConnectionOptions,
  RoomConnectionState,
  RoomConnectionStatus,
  SeatStore,
  SendOptions,
  TimerApi,
  WakeInfo,
  WebSocketLike,
} from './connection-types'
import { decodeDomainEvent } from './domain-events'
import { isRoomView } from './room-view'
import { ServerClock } from './server-clock'

export type * from './connection-types'

const SOCKET_OPEN = 1
const CLOSE_REPLACED = 4001
const CLOSE_NOT_FOUND = 4404
const CLOSE_NORMAL = 1000
export const DEFAULT_COMMAND_TIMEOUT_MS = 8_000
/** Hidden at least this long: assume the socket may be dead on return. */
export const STALE_AFTER_HIDDEN_MS = 30_000
/** Above this many queued bytes, drawing batches wait and coalesce. */
export const SOCKET_CONGESTION_BYTES = 256 * 1024

const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_.-]{16,256}$/

interface PendingCommand {
  readonly commandId: string
  readonly clientSeq: number
  readonly command: RoomCommand
  readonly resolve: (status: AckStatus) => void
  readonly reject: (error: RoomCommandError) => void
  timer: unknown
}

interface PendingJoin {
  readonly params: JoinParams
  readonly resolve: () => void
  readonly reject: (error: RoomCommandError) => void
  readonly promise: Promise<void>
  timer: unknown
}

interface Handshake {
  readonly kind: 'join' | 'resume'
  readonly commandId: string
  timer: unknown
}

/**
 * One tab's live link to a room: handshake, command acks, retries with the
 * same command ids, reconnects, and server clock tracking. Framework-free;
 * `useRoom` adapts it for React.
 */
export class RoomConnection {
  readonly roomCode: string
  private readonly options: RoomConnectionOptions
  private readonly seats: SeatStore
  private readonly timers: TimerApi
  private readonly now: () => number
  private readonly random: () => number
  private readonly commandTimeoutMs: number
  private readonly sessionId: string
  private readonly seqStore: ClientSeqStore
  private readonly clock = new ServerClock()

  private state: RoomConnectionState
  private readonly stateListeners = new Set<() => void>()
  private readonly eventListeners = new Set<
    (event: RoomConnectionEvent) => void
  >()

  private socket: WebSocketLike | null = null
  private bound = false
  private started = false
  private everConnected = false
  private offeredJoin = false
  private attempt = 0
  private reconnectTimer: unknown = null
  private seat: identity.Seat | null
  private pendingJoin: PendingJoin | null = null
  private handshake: Handshake | null = null
  private readonly pending = new Map<string, PendingCommand>()
  private clientSeq: number
  private lastRoomSeq = 0
  private stopLifecycle: () => void = () => {}

  constructor(options: RoomConnectionOptions) {
    this.options = options
    this.roomCode = options.roomCode
    this.seats = options.seats ?? browserSeats
    this.timers = options.timers ?? browserTimers
    this.now = options.now ?? Date.now
    this.random = options.random ?? Math.random
    this.commandTimeoutMs =
      options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS
    this.sessionId = options.sessionId ?? identity.getTabSessionId()
    this.seqStore = options.clientSeqStore ?? {
      load: identity.loadClientSeq,
      store: identity.storeClientSeq,
    }
    this.clientSeq = this.seqStore.load()

    this.seat = this.seats.loadTabSeat(this.roomCode)
    const latest = this.seat ? null : this.seats.loadLatestSeat(this.roomCode)
    this.state = {
      status: 'connecting',
      view: null,
      memberId: this.seat?.memberId ?? null,
      savedSeat: latest
        ? { memberId: latest.memberId, displayName: latest.displayName }
        : null,
    }
  }

  /* ----------------------------- subscriptions ---------------------------- */

  getState = (): RoomConnectionState => this.state

  /** State changes (status, view, member). Compatible with useSyncExternalStore. */
  subscribe = (listener: () => void): (() => void) => {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  /** Domain events, notices, and unattributed server errors. */
  onEvent(listener: (event: RoomConnectionEvent) => void): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  /** Best estimate of the server's clock, in epoch milliseconds. */
  serverNow = (): number => this.clock.now(this.now())

  get status(): RoomConnectionStatus {
    return this.state.status
  }

  /** True while the socket is bound and not backed up. */
  canSendDrawing(): boolean {
    return this.isBoundAndOpen() && !this.isCongested()
  }

  isCongested(): boolean {
    return (this.socket?.bufferedAmount ?? 0) > SOCKET_CONGESTION_BYTES
  }

  /* ------------------------------- lifecycle ------------------------------ */

  connect(): void {
    if (this.started || this.state.status === 'closed') return
    this.started = true
    const lifecycle =
      this.options.lifecycle === undefined
        ? browserLifecycle
        : this.options.lifecycle
    if (lifecycle) this.stopLifecycle = lifecycle((info) => this.wake(info))
    this.openSocket()
  }

  /** Ends the connection for good (unmount). Pending commands are rejected. */
  dispose(): void {
    if (this.state.status === 'closed') return
    this.stopLifecycle()
    this.clearReconnectTimer()
    this.dropSocket(CLOSE_NORMAL)
    this.failEverything('CLOSED', 'The room connection was closed.')
    this.setState({ status: 'closed' })
  }

  /**
   * Reconnect right away instead of waiting out the backoff. After a long
   * time in the background a socket can look open but be dead (mobile
   * Safari often never fires `close`), so it is replaced and resumed.
   */
  wake(info: WakeInfo = {}): void {
    if (this.reconnectTimer !== null) {
      this.clearReconnectTimer()
      this.openSocket()
      return
    }
    const stale = (info.hiddenForMs ?? 0) >= STALE_AFTER_HIDDEN_MS
    if (stale && this.socket && !this.isTerminal()) {
      this.attempt = 0
      this.openSocket()
    }
  }

  /** Take the seat back after another tab replaced this one. */
  reclaim(): void {
    if (this.state.status !== 'replaced') return
    this.attempt = 0
    this.openSocket()
  }

  /* ------------------------------ handshake ------------------------------- */

  join(params: JoinParams): Promise<void> {
    if (this.bound) {
      return Promise.reject(
        new RoomCommandError('BAD_COMMAND', 'You are already in this room.'),
      )
    }
    if (this.pendingJoin) return this.pendingJoin.promise
    if (this.isTerminal()) {
      return Promise.reject(
        new RoomCommandError('CLOSED', 'This room is not available.'),
      )
    }

    const command = this.buildJoinCommand(params)
    const parsed = clientCommandSchema.safeParse(command)
    if (!parsed.success) {
      return Promise.reject(
        new RoomCommandError('BAD_COMMAND', 'Pick a name with 1–24 letters.'),
      )
    }

    let resolve: () => void = () => {}
    let reject: (error: RoomCommandError) => void = () => {}
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise
      reject = rejectPromise
    })
    const pendingJoin: PendingJoin = {
      params,
      resolve,
      reject,
      promise,
      timer: null,
    }
    pendingJoin.timer = this.timers.setTimeout(() => {
      if (this.pendingJoin !== pendingJoin) return
      this.pendingJoin = null
      if (this.handshake?.kind === 'join') this.clearHandshake()
      reject(
        new RoomCommandError(
          'TIMEOUT',
          'Joining took too long. Check your connection and try again.',
          { retryable: true },
        ),
      )
      if (!this.bound) this.setState({ status: this.unboundStatus() })
    }, this.commandTimeoutMs)
    this.pendingJoin = pendingJoin
    // "Join as someone new": this tab stops using any saved seat. Storage is
    // left alone because another tab may still be playing as it.
    if (this.handshake?.kind !== 'resume') this.seat = null
    this.setState({ status: 'joining', savedSeat: null })

    if (this.canHandshakeNow()) {
      this.sendHandshake('join')
    } else if (this.reconnectTimer !== null) {
      this.wake()
    } else if (!this.socket) {
      this.openSocket()
    }
    return promise
  }

  /** "Continue as X": adopt the seat another tab saved. */
  resumeSavedSeat(): void {
    const saved = this.seats.loadLatestSeat(this.roomCode)
    if (!saved || this.bound) return
    this.seats.claimSeatForTab(this.roomCode, saved.memberId)
    this.seat = saved
    this.offeredJoin = false
    this.setState({
      savedSeat: null,
      memberId: saved.memberId,
      status: 'joining',
    })
    if (this.canHandshakeNow()) {
      this.sendHandshake('resume')
    } else if (this.reconnectTimer !== null) {
      this.wake()
    } else if (!this.socket && !this.isTerminal()) {
      this.openSocket()
    }
  }

  /**
   * Leaves the room and forgets this tab's seat. The socket is replaced by a
   * fresh, unbound one so the same screen can offer "join again".
   */
  async leave(): Promise<void> {
    if (this.bound) {
      try {
        await this.send({ type: 'room.leave' })
      } catch {
        // Leaving is best effort: the seat is forgotten locally regardless.
      }
    }
    if (this.seat) this.seats.forgetSeat(this.roomCode, this.seat.memberId)
    this.seat = null
    this.failPending('CLOSED', 'You left the room.')
    this.dropSocket(CLOSE_NORMAL)
    this.offeredJoin = true
    this.setState({ memberId: null, status: 'needs-join' })
    if (!this.isTerminal()) this.openSocket()
  }

  /* ------------------------------- commands ------------------------------- */

  /**
   * Sends a command and resolves with the server's ack. While disconnected the
   * command waits; after a reconnect and resume it is resent with the same
   * commandId/clientSeq so the room applies it at most once.
   */
  send(command: RoomCommand, options: SendOptions = {}): Promise<AckStatus> {
    if (this.isTerminal()) {
      return Promise.reject(
        new RoomCommandError('CLOSED', 'This room connection has ended.'),
      )
    }
    // Drawing batches are built by the canvas store and are hot; everything
    // else is cheap to validate before it can fail on the server.
    if (
      command.type !== 'drawing.batch' &&
      !clientCommandSchema.safeParse(command).success
    ) {
      return Promise.reject(
        new RoomCommandError('BAD_COMMAND', 'That action is not valid.'),
      )
    }

    const commandId = randomId()
    const clientSeq = this.nextClientSeq()
    return new Promise<AckStatus>((resolve, reject) => {
      const entry: PendingCommand = {
        commandId,
        clientSeq,
        command,
        resolve,
        reject,
        timer: null,
      }
      const timeoutMs =
        options.timeoutMs === undefined
          ? this.commandTimeoutMs
          : options.timeoutMs
      if (timeoutMs !== null) {
        entry.timer = this.timers.setTimeout(() => {
          if (!this.pending.delete(commandId)) return
          reject(
            new RoomCommandError(
              'TIMEOUT',
              'The room did not answer in time. Try again.',
              { retryable: true, commandId },
            ),
          )
        }, timeoutMs)
      }
      this.pending.set(commandId, entry)
      if (this.isBoundAndOpen()) this.writeCommand(entry)
    })
  }

  /* ------------------------------- internals ------------------------------ */

  private isTerminal(): boolean {
    const { status } = this.state
    return status === 'closed' || status === 'not-found'
  }

  private isBoundAndOpen(): boolean {
    return this.bound && this.socket?.readyState === SOCKET_OPEN
  }

  private canHandshakeNow(): boolean {
    return (
      !this.bound &&
      this.handshake === null &&
      this.socket?.readyState === SOCKET_OPEN
    )
  }

  /** What to show while not bound, so the join form does not flicker. */
  private unboundStatus(): RoomConnectionStatus {
    if (this.pendingJoin) return 'joining'
    if (!this.seat && this.offeredJoin) return 'needs-join'
    return this.everConnected ? 'reconnecting' : 'connecting'
  }

  private openSocket(): void {
    if (this.isTerminal()) return
    this.dropSocket(CLOSE_NORMAL)
    this.setState({ status: this.unboundStatus() })

    const url = (this.options.socketUrl ?? defaultSocketUrl)(
      this.roomCode,
      this.sessionId,
    )
    let socket: WebSocketLike
    try {
      socket = (this.options.createSocket ?? createBrowserSocket)(url)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.socket = socket
    socket.onopen = () => {
      if (this.socket !== socket) return
      this.everConnected = true
      this.beginHandshake()
    }
    socket.onmessage = (event) => {
      if (this.socket !== socket) return
      this.handleMessage(event.data)
    }
    socket.onclose = (event) => {
      if (this.socket !== socket) return
      this.handleClose(event.code)
    }
    socket.onerror = () => {
      // A close event always follows; reconnect logic lives there.
    }
  }

  /** Detaches and closes the current socket without triggering reconnects. */
  private dropSocket(code: number): void {
    const socket = this.socket
    if (!socket) return
    this.socket = null
    this.bound = false
    this.clearHandshake()
    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null
    try {
      socket.close(code)
    } catch {
      // Already closing.
    }
  }

  private beginHandshake(): void {
    this.bound = false
    if (this.seat) {
      this.sendHandshake('resume')
    } else if (this.pendingJoin) {
      this.sendHandshake('join')
    } else {
      this.offeredJoin = true
      this.setState({ status: 'needs-join' })
    }
  }

  private sendHandshake(kind: 'join' | 'resume'): void {
    const socket = this.socket
    if (!socket || socket.readyState !== SOCKET_OPEN) return

    let command: JoinCommand | ResumeCommand
    if (kind === 'resume') {
      if (!this.seat) return
      const accountToken = this.validAccountToken()
      command = {
        type: 'room.resume',
        resumeToken: this.seat.resumeToken,
        ...(accountToken ? { accountToken } : {}),
      }
    } else {
      if (!this.pendingJoin) return
      command = this.buildJoinCommand(this.pendingJoin.params)
    }

    const commandId = randomId()
    const handshake: Handshake = { kind, commandId, timer: null }
    handshake.timer = this.timers.setTimeout(() => {
      if (this.handshake !== handshake) return
      // No answer: treat the socket as dead and start over.
      this.handshake = null
      this.dropSocket(CLOSE_NORMAL)
      this.scheduleReconnect()
    }, this.commandTimeoutMs)
    this.handshake = handshake
    if (kind === 'join') this.setState({ status: 'joining' })

    this.writeEnvelope(socket, commandId, this.nextClientSeq(), command)
  }

  private buildJoinCommand(params: JoinParams): JoinCommand {
    const accountToken = this.validAccountToken()
    const recentWordIds = (this.options.getRecentWordIds?.() ?? [])
      .filter(isRecordableWordId)
      .slice(0, 300)
    const command: JoinCommand = {
      type: 'room.join',
      displayName: normalizeDisplayName(params.displayName),
      ...(accountToken ? { accountToken } : {}),
      ...(recentWordIds.length > 0 &&
      recentWordIdsSchema.safeParse(recentWordIds).success
        ? { recentWordIds }
        : {}),
      ...(params.team ? { team: params.team } : {}),
    }
    return command
  }

  private validAccountToken(): string | null {
    const token = this.options.getAccountToken?.() ?? null
    return token && OPAQUE_TOKEN_PATTERN.test(token) ? token : null
  }

  private completeHandshake(): void {
    const handshake = this.handshake
    this.clearHandshake()
    this.bound = true
    this.attempt = 0
    this.offeredJoin = false

    if (handshake?.kind === 'join' || this.pendingJoin) {
      const join = this.pendingJoin
      this.pendingJoin = null
      if (join) {
        this.timers.clearTimeout(join.timer)
        join.resolve()
      }
    }

    this.setState({ status: 'open', savedSeat: null })
    for (const entry of this.pending.values()) {
      if (!this.isBoundAndOpen()) break
      this.writeCommand(entry)
    }
  }

  private clearHandshake(): void {
    if (this.handshake) this.timers.clearTimeout(this.handshake.timer)
    this.handshake = null
  }

  private writeCommand(entry: PendingCommand): void {
    const socket = this.socket
    if (!socket) return
    this.writeEnvelope(socket, entry.commandId, entry.clientSeq, entry.command)
  }

  private writeEnvelope(
    socket: WebSocketLike,
    commandId: string,
    clientSeq: number,
    command: ClientCommand,
  ): void {
    const envelope: CommandEnvelopeV1 = {
      version: PROTOCOL_VERSION,
      commandId,
      sessionId: this.sessionId,
      roomCode: this.roomCode,
      clientSeq,
      lastRoomSeq: this.lastRoomSeq,
      command,
    }
    try {
      socket.send(JSON.stringify(envelope))
    } catch {
      // The socket is closing; pending commands are resent after reconnect.
    }
  }

  private nextClientSeq(): number {
    this.clientSeq += 1
    this.seqStore.store(this.clientSeq)
    return this.clientSeq
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return
    let envelope: ServerEventEnvelopeV1
    try {
      envelope = parseServerEventEnvelopeV1(JSON.parse(data))
    } catch {
      return
    }
    if (envelope.roomCode !== this.roomCode) return

    this.lastRoomSeq = Math.max(this.lastRoomSeq, envelope.roomSeq)
    this.clock.observe(envelope.serverTimeMs, this.now())

    const event = envelope.event
    switch (event.type) {
      case 'command.ack':
        this.handleAck(event.commandId, event.status)
        return
      case 'protocol.error':
        this.handleProtocolError(event)
        return
      case 'room.snapshot':
        this.handleView(event.state)
        return
      case 'domain.event':
        this.handleDomainEvent(event.name, event.payload)
        return
    }
  }

  private handleAck(commandId: string, status: AckStatus): void {
    if (this.handshake?.commandId === commandId) {
      this.completeHandshake()
      return
    }
    const entry = this.pending.get(commandId)
    if (!entry) return
    this.pending.delete(commandId)
    this.timers.clearTimeout(entry.timer)
    entry.resolve(status)
  }

  private handleProtocolError(event: ErrorServerEvent): void {
    const error = new RoomCommandError(event.code, event.message, {
      retryable: event.retryable,
      commandId: event.commandId ?? null,
    })

    if (event.code === 'ROOM_NOT_FOUND') {
      this.enterNotFound(error)
      return
    }

    const handshake = this.handshake
    if (handshake && event.commandId === handshake.commandId) {
      this.clearHandshake()
      if (handshake.kind === 'resume') {
        this.handleResumeRejected(event)
      } else {
        const join = this.pendingJoin
        this.pendingJoin = null
        if (join) {
          this.timers.clearTimeout(join.timer)
          join.reject(error)
        }
        this.offeredJoin = true
        this.setState({ status: 'needs-join' })
      }
      return
    }

    const entry = event.commandId ? this.pending.get(event.commandId) : null
    if (entry) {
      this.pending.delete(entry.commandId)
      this.timers.clearTimeout(entry.timer)
      entry.reject(error)
      return
    }

    this.emit({ type: 'error', error })
  }

  private handleResumeRejected(event: ErrorServerEvent): void {
    if (event.code !== 'UNAUTHORIZED') {
      // Transient trouble (e.g. INTERNAL): retry the resume on a new socket.
      this.dropSocket(CLOSE_NORMAL)
      this.scheduleReconnect()
      return
    }
    if (this.seat) this.seats.forgetSeat(this.roomCode, this.seat.memberId)
    this.seat = null
    this.failPending('UNAUTHORIZED', 'Join the room to keep playing.')
    this.setState({ status: 'unauthorized', memberId: null })
    this.emit({ type: 'notice', notice: 'seat-expired' })
    if (this.pendingJoin) {
      this.sendHandshake('join')
    } else {
      this.offeredJoin = true
      this.setState({ status: 'needs-join' })
    }
  }

  private handleView(state: unknown): void {
    if (!isRoomView(state)) return
    const me = state.me
    if (me) {
      const member = state.members.find((entry) => entry.id === me.memberId)
      if (member && this.seat?.memberId === me.memberId) {
        this.seats.updateSeatDisplayName(
          this.roomCode,
          me.memberId,
          member.displayName,
        )
      }
    }
    this.setState({
      view: state,
      memberId: me?.memberId ?? this.state.memberId,
    })
  }

  private handleDomainEvent(name: string, payload: unknown): void {
    const decoded = decodeDomainEvent(name, payload)
    if (!decoded) return
    if (decoded.type !== 'session.issued') {
      this.emit(decoded)
      return
    }

    const joinName = this.pendingJoin?.params.displayName
    const displayName = joinName
      ? normalizeDisplayName(joinName)
      : (this.seat?.displayName ?? '')
    const seat = { ...decoded.payload, displayName }
    this.seats.saveSeat(this.roomCode, seat)
    this.seat = { ...seat, savedAtMs: this.now() }
    this.setState({ memberId: seat.memberId })
    this.emit({ type: 'session.issued', memberId: seat.memberId })
    // Servers may send the private session event before the ack; either one
    // completes the handshake.
    if (!this.bound && this.handshake) this.completeHandshake()
  }

  private handleClose(code: number): void {
    this.socket = null
    this.bound = false
    this.clearHandshake()

    if (code === CLOSE_REPLACED) {
      this.setState({ status: 'replaced' })
      this.emit({ type: 'notice', notice: 'replaced' })
      return
    }
    if (code === CLOSE_NOT_FOUND) {
      this.enterNotFound(
        new RoomCommandError('ROOM_NOT_FOUND', 'This room does not exist.'),
      )
      return
    }
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.isTerminal() || this.reconnectTimer !== null) return
    const delay = reconnectDelayMs(this.attempt, this.random)
    this.attempt += 1
    this.setState({ status: this.unboundStatus() })
    this.reconnectTimer = this.timers.setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket()
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) return
    this.timers.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private enterNotFound(error: RoomCommandError): void {
    this.clearReconnectTimer()
    this.dropSocket(CLOSE_NORMAL)
    this.failEverything(error.code, error.message)
    this.setState({ status: 'not-found' })
  }

  private failPending(code: RoomCommandError['code'], message: string): void {
    for (const entry of this.pending.values()) {
      this.timers.clearTimeout(entry.timer)
      entry.reject(
        new RoomCommandError(code, message, { commandId: entry.commandId }),
      )
    }
    this.pending.clear()
  }

  private failEverything(
    code: RoomCommandError['code'],
    message: string,
  ): void {
    this.failPending(code, message)
    const join = this.pendingJoin
    this.pendingJoin = null
    if (join) {
      this.timers.clearTimeout(join.timer)
      join.reject(new RoomCommandError(code, message))
    }
  }

  private setState(patch: Partial<RoomConnectionState>): void {
    const next = { ...this.state, ...patch }
    if (
      next.status === this.state.status &&
      next.view === this.state.view &&
      next.memberId === this.state.memberId &&
      next.savedSeat === this.state.savedSeat
    ) {
      return
    }
    this.state = next
    for (const listener of [...this.stateListeners]) listener()
  }

  private emit(event: RoomConnectionEvent): void {
    for (const listener of [...this.eventListeners]) listener(event)
  }
}

/** Mirrors the room's name rules (trim, collapse spaces, 24 chars). */
function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 24)
}
