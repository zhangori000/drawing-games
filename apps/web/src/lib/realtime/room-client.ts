import type { DrawingAction } from '@drawing-games/drawing-model'
import type { GuessVerdict, RoomView, TeamId } from '@drawing-games/game-core'
import type {
  DraftReplacementReason,
  RoomSettingsPatch,
} from '@drawing-games/protocol'

import { readAccountToken } from '../account/token-store'
import { rememberDisplayName } from '../identity'
import { getRecentWordIds, recordWordIds } from '../word-history'
import { CanvasStore } from './canvas-store'
import { RoomCommandError, isRoomCommandError } from './command-error'
import { RoomConnection } from './room-connection'
import type {
  JoinParams,
  RoomCommand,
  RoomConnectionEvent,
  RoomConnectionOptions,
  RoomConnectionStatus,
  SavedSeatSummary,
} from './room-connection'
import { SeenWordsTracker } from './seen-words'

export interface RoomToast {
  readonly id: number
  readonly message: string
  readonly tone: 'error' | 'info'
}

export interface GuessFeedback {
  /** Increments per feedback so repeated verdicts still re-render. */
  readonly id: number
  readonly text: string
  readonly verdict: GuessVerdict
}

export interface RoomClientSnapshot {
  readonly status: RoomConnectionStatus
  readonly view: RoomView | null
  readonly memberId: string | null
  readonly savedSeat: SavedSeatSummary | null
  readonly lastFeedback: GuessFeedback | null
  readonly toasts: readonly RoomToast[]
}

/**
 * Every command a match screen can send. Each promise resolves on the room's
 * ack and rejects with a `RoomCommandError`; failures (other than join and
 * guess, which screens show inline) are also pushed to the toast queue, and
 * ignoring a returned promise never causes an unhandled rejection.
 */
export interface RoomActions {
  join(params: JoinParams): Promise<void>
  /** "Continue as X" with the seat another tab saved. */
  resumeSavedSeat(): void
  leave(): Promise<void>
  rename(displayName: string): Promise<void>
  setTeam(team: TeamId, memberId?: string): Promise<void>
  shuffle(): Promise<void>
  setReady(ready: boolean): Promise<void>
  updateSettings(patch: RoomSettingsPatch): Promise<void>
  addBot(team: TeamId): Promise<void>
  removeMember(memberId: string): Promise<void>
  start(): Promise<void>
  selectWord(optionId: string): Promise<void>
  replaceWord(optionId: string, reason: DraftReplacementReason): Promise<void>
  guess(text: string): Promise<void>
  voteHint(approve: boolean): Promise<void>
  voteSurrender(approve: boolean): Promise<void>
  continueRound(): Promise<void>
  rematch(mode: 'same-settings' | 'change-settings'): Promise<void>
  /** Links (or with null, unlinks) a quick account to this seat. */
  linkAccount(accountToken: string | null): Promise<void>
  /** Applies ops to the local canvas now and streams them in batches. */
  sendDrawing(canvasId: string, ops: readonly DrawingAction[]): void
  /** Take the seat back after another tab replaced this one. */
  reclaim(): void
  dismissToast(id: number): void
}

const MAX_TOASTS = 4

export type RoomClientConnectionOptions = Omit<
  RoomConnectionOptions,
  'roomCode' | 'getAccountToken' | 'getRecentWordIds'
>

/**
 * Framework-free room session for one screen: owns the connection (recreated
 * on every `start()`), the canvas store, the toast queue, private guess
 * feedback, and guest word history. `useRoom` is a thin React adapter.
 */
export class RoomClient {
  readonly roomCode: string
  readonly canvasStore: CanvasStore
  readonly actions: RoomActions

  private connection: RoomConnection | null = null
  private detach: () => void = () => {}
  private snapshot: RoomClientSnapshot
  private readonly listeners = new Set<() => void>()
  private readonly seenWords = new SeenWordsTracker()
  private nextToastId = 1
  private nextFeedbackId = 1
  private readonly connectionOptions: RoomClientConnectionOptions

  static readonly initialSnapshot: RoomClientSnapshot = Object.freeze({
    status: 'connecting',
    view: null,
    memberId: null,
    savedSeat: null,
    lastFeedback: null,
    toasts: [],
  })

  constructor(
    roomCode: string,
    connectionOptions: RoomClientConnectionOptions = {},
  ) {
    this.roomCode = roomCode
    this.connectionOptions = connectionOptions
    this.snapshot = RoomClient.initialSnapshot
    this.canvasStore = new CanvasStore({
      timers: connectionOptions.timers,
      canSend: () => this.connection?.canSendDrawing() ?? false,
      sendBatch: (_canvasId, ops) => {
        const connection = this.connection
        if (!connection) {
          return Promise.reject(new RoomCommandError('CLOSED', 'Offline'))
        }
        // Drawing never times out: held batches are resent after a resume.
        return connection.send(
          { type: 'drawing.batch', operations: [...ops] },
          { timeoutMs: null },
        )
      },
    })
    this.actions = this.createActions()
  }

  /* ----------------------------- subscription ----------------------------- */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): RoomClientSnapshot => this.snapshot

  serverNow = (): number => this.connection?.serverNow() ?? Date.now()

  /* ------------------------------- lifecycle ------------------------------ */

  start(): void {
    if (this.connection) return
    const connection = new RoomConnection({
      ...this.connectionOptions,
      roomCode: this.roomCode,
      getAccountToken: readAccountToken,
      getRecentWordIds,
    })
    this.connection = connection
    const offState = connection.subscribe(() => this.syncConnectionState())
    const offEvents = connection.onEvent((event) => this.handleEvent(event))
    this.detach = () => {
      offState()
      offEvents()
    }
    this.syncConnectionState()
    connection.connect()
  }

  stop(): void {
    const connection = this.connection
    if (!connection) return
    this.detach()
    this.connection = null
    this.canvasStore.dispose()
    connection.dispose()
  }

  /* ------------------------------- internals ------------------------------ */

  private syncConnectionState(): void {
    const connection = this.connection
    if (!connection) return
    const state = connection.getState()
    if (state.view && state.view !== this.snapshot.view) {
      const ids = this.seenWords.observe(state.view)
      if (ids.length > 0) recordWordIds(ids)
    }
    if (
      state.status === 'open' &&
      this.snapshot.status !== 'open' &&
      this.canvasStore.hasUnsentOps()
    ) {
      this.canvasStore.flush()
    }
    this.update({
      status: state.status,
      view: state.view,
      memberId: state.memberId,
      savedSeat: state.savedSeat,
    })
  }

  private handleEvent(event: RoomConnectionEvent): void {
    switch (event.type) {
      case 'canvas.snapshot':
        this.canvasStore.applySnapshot(
          event.payload.canvasId,
          event.payload.document,
        )
        return
      case 'canvas.ops':
        this.canvasStore.applyRemoteOps(
          event.payload.canvasId,
          event.payload.ops,
        )
        return
      case 'canvas.preview':
        this.canvasStore.setPreview(event.payload)
        return
      case 'guess.feedback':
        this.update({
          lastFeedback: {
            id: this.nextFeedbackId++,
            text: event.payload.text,
            verdict: event.payload.verdict,
          },
        })
        return
      case 'error':
        this.pushToast(event.error.message, 'error')
        return
      case 'notice':
        if (event.notice === 'seat-expired') {
          this.pushToast(
            'Your saved seat is no longer in this room. Join again to play.',
            'info',
          )
        }
        return
      case 'session.issued':
        return
    }
  }

  private pushToast(message: string, tone: RoomToast['tone']): void {
    const last = this.snapshot.toasts.at(-1)
    if (last?.message === message) return
    const toast: RoomToast = { id: this.nextToastId++, message, tone }
    this.update({
      toasts: [...this.snapshot.toasts, toast].slice(-MAX_TOASTS),
    })
  }

  private dismissToast(id: number): void {
    if (!this.snapshot.toasts.some((toast) => toast.id === id)) return
    this.update({
      toasts: this.snapshot.toasts.filter((toast) => toast.id !== id),
    })
  }

  private update(patch: Partial<RoomClientSnapshot>): void {
    const next = { ...this.snapshot, ...patch }
    const changed = (Object.keys(patch) as (keyof RoomClientSnapshot)[]).some(
      (key) => next[key] !== this.snapshot[key],
    )
    if (!changed) return
    this.snapshot = next
    for (const listener of [...this.listeners]) listener()
  }

  /** Sends a command; failures become toasts unless `toast` is false. */
  private run(command: RoomCommand, toast = true): Promise<void> {
    const connection = this.connection
    const promise = connection
      ? connection.send(command).then(() => undefined)
      : Promise.reject(
          new RoomCommandError('CLOSED', 'Still connecting to the room.'),
        )
    // Marks the promise handled; callers that await it still see the error.
    promise.catch((error: unknown) => {
      if (!toast) return
      if (isRoomCommandError(error) && error.code === 'CLOSED') return
      this.pushToast(
        error instanceof Error ? error.message : 'Something went wrong.',
        'error',
      )
    })
    return promise
  }

  private createActions(): RoomActions {
    return {
      join: (params) => {
        rememberDisplayName(params.displayName)
        const connection = this.connection
        const promise = connection
          ? connection.join(params)
          : Promise.reject(
              new RoomCommandError('CLOSED', 'Still connecting to the room.'),
            )
        promise.catch(() => {})
        return promise
      },
      resumeSavedSeat: () => this.connection?.resumeSavedSeat(),
      leave: async () => {
        await this.connection?.leave()
      },
      rename: (displayName) => {
        rememberDisplayName(displayName)
        return this.run({ type: 'member.rename', displayName })
      },
      setTeam: (team, memberId) =>
        this.run({
          type: 'lobby.team',
          team,
          ...(memberId ? { memberId } : {}),
        }),
      shuffle: () => this.run({ type: 'lobby.shuffle' }),
      setReady: (ready) => this.run({ type: 'lobby.ready', ready }),
      updateSettings: (patch) => this.run({ type: 'lobby.settings', patch }),
      addBot: (team) => this.run({ type: 'lobby.bot.add', team }),
      removeMember: (memberId) =>
        this.run({ type: 'lobby.member.remove', memberId }),
      start: () => this.run({ type: 'match.start' }),
      selectWord: (optionId) => this.run({ type: 'draft.select', optionId }),
      replaceWord: (optionId, reason) =>
        this.run({ type: 'draft.replace', optionId, reason }),
      guess: (text) => this.run({ type: 'guess.submit', text }, false),
      voteHint: (approve) =>
        this.run({ type: 'hint.vote', hint: 'word-length', approve }),
      voteSurrender: (approve) => this.run({ type: 'surrender.vote', approve }),
      continueRound: () => this.run({ type: 'round.continue' }),
      rematch: (mode) => this.run({ type: 'rematch.vote', mode }),
      linkAccount: (accountToken) =>
        this.run({ type: 'account.link', accountToken }),
      sendDrawing: (canvasId, ops) =>
        this.canvasStore.queueLocalOps(canvasId, ops),
      reclaim: () => this.connection?.reclaim(),
      dismissToast: (id) => this.dismissToast(id),
    }
  }
}
