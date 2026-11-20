import type { DrawingAction } from '@drawing-games/drawing-model'
import type { GuessVerdict, RoomView, TeamId } from '@drawing-games/game-core'
import {
  accountIdFromToken,
  type DraftReplacementReason,
  type RoomSettingsPatch,
} from '@drawing-games/protocol'

import { readAccountToken, subscribeAccountToken } from '../account/token-store'
import { rememberDisplayName } from '../identity'
import {
  getWordHistory,
  isRecordableWordId,
  recordWordHistory,
} from '../word-history'
import { CanvasStore } from './canvas-store'
import { RoomCommandError, isRoomCommandError } from './command-error'
import { GuessPacer } from './guess-pacer'
import { autoPickNotice } from './auto-pick-notice'
import { drawerHandoffNotice } from './handoff-notice'
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
  /**
   * Queued and sent in order, spaced to the room's guess rate limit; a guess
   * the room refuses only for its speed is resent, never dropped.
   */
  guess(text: string): Promise<void>
  voteHint(approve: boolean): Promise<void>
  voteSurrender(approve: boolean): Promise<void>
  continueRound(): Promise<void>
  rematch(mode: 'same-settings' | 'change-settings'): Promise<void>
  /**
   * Links (or with null, unlinks) a quick account to this seat. The client
   * already does this by itself whenever this browser signs in or out (see
   * `syncAccountLink`); a call for the link already in flight shares it.
   */
  linkAccount(accountToken: string | null): Promise<void>
  /** Applies ops to the local canvas now and streams them in batches. */
  sendDrawing(canvasId: string, ops: readonly DrawingAction[]): void
  /** Take the seat back after another tab replaced this one. */
  reclaim(): void
  dismissToast(id: number): void
}

const MAX_TOASTS = 4

/** This browser's quick-account sign-in, shared by every tab. */
export interface AccountTokenSource {
  read(): string | null
  /** Fires when the token may have changed, in this tab or another. */
  subscribe(listener: () => void): () => void
}

const browserAccountTokens: AccountTokenSource = {
  read: readAccountToken,
  subscribe: subscribeAccountToken,
}

export type RoomClientConnectionOptions = Omit<
  RoomConnectionOptions,
  'roomCode' | 'getAccountToken' | 'getWordHistory'
> & {
  readonly accountTokens?: AccountTokenSource
}

interface AccountLinkRequest {
  readonly token: string | null
  readonly promise: Promise<void>
}

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
  private readonly guessPacer: GuessPacer
  private nextToastId = 1
  private nextFeedbackId = 1
  private readonly connectionOptions: Omit<
    RoomClientConnectionOptions,
    'accountTokens'
  >
  private readonly accountTokens: AccountTokenSource
  private accountLink: AccountLinkRequest | null = null
  /** The seat/sign-in mismatch last acted on, so a failure is not retried. */
  private accountSyncKey: string | null = null

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
    const { accountTokens = browserAccountTokens, ...rest } = connectionOptions
    this.connectionOptions = rest
    this.accountTokens = accountTokens
    this.snapshot = RoomClient.initialSnapshot
    this.canvasStore = new CanvasStore({
      timers: connectionOptions.timers,
      canSend: () => this.connection?.canSendDrawing() ?? false,
      requestResync: () => this.connection?.resync(),
      sendBatch: (canvasId, ops) => {
        const connection = this.connection
        if (!connection) {
          return Promise.reject(new RoomCommandError('CLOSED', 'Offline'))
        }
        // Drawing never times out: held batches are resent after a resume.
        // A batch is only written while its canvas is still this member's
        // to draw on, and it names that canvas, so the room refuses one
        // that arrives after the round or showdown card moved on
        // (`STALE_CLIENT`, dropped by the canvas store) instead of putting
        // old ink on the new canvas.
        return connection.send(
          { type: 'drawing.batch', canvasId, operations: [...ops] },
          {
            timeoutMs: null,
            isCurrent: () =>
              drawableCanvasId(connection.getState().view) === canvasId,
          },
        )
      },
    })
    // Guesses go out one at a time, spaced to the room's rate limit, so a
    // quick typist's guesses are queued instead of rejected and lost.
    this.guessPacer = new GuessPacer({
      send: (text) => this.run({ type: 'guess.submit', text }, false),
      timers: connectionOptions.timers,
      now: connectionOptions.now,
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
      getAccountToken: () => this.accountTokens.read(),
      getWordHistory,
    })
    this.connection = connection
    const offState = connection.subscribe(() => this.syncConnectionState())
    const offEvents = connection.onEvent((event) => this.handleEvent(event))
    const offAccount = this.accountTokens.subscribe(() =>
      this.syncAccountLink(),
    )
    this.detach = () => {
      offState()
      offEvents()
      offAccount()
    }
    this.syncConnectionState()
    connection.connect()
  }

  stop(): void {
    const connection = this.connection
    if (!connection) return
    this.detach()
    this.connection = null
    this.guessPacer.cancel(
      new RoomCommandError('CLOSED', 'Not connected to the room.'),
    )
    this.accountLink = null
    this.accountSyncKey = null
    this.canvasStore.dispose()
    connection.dispose()
  }

  /* ------------------------------- internals ------------------------------ */

  private syncConnectionState(): void {
    const connection = this.connection
    if (!connection) return
    const state = connection.getState()
    const previousView = this.snapshot.view
    let handoff: string | null = null
    let autoPick: string | null = null
    let accountNotice: string | null = null
    if (state.view && state.view !== previousView) {
      recordWordHistory(this.seenWords.observe(state.view))
      handoff = drawerHandoffNotice(previousView, state.view)
      autoPick = autoPickNotice(previousView, state.view)
      accountNotice = accountLinkNotice(previousView, state.view)
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
    // e.g. "Max left the room. You're drawing now…", with the new screen.
    if (handoff) this.pushToast(handoff, 'info')
    // "Time's up! We picked paper shredder (Hard +40) for you."
    if (autoPick) this.pushToast(autoPick, 'info')
    // "Saved to @mina: this match is in your stats.", once the room says so.
    if (accountNotice) this.pushToast(accountNotice, 'info')
    this.syncAccountLink()
  }

  /**
   * Keeps the seat's account link in step with this browser's sign-in. A
   * sign-out, in this tab or another (or while this room was closed), unlinks
   * the seat so later play is no longer recorded to that account; a sign-in
   * links it now rather than at the next reconnect (a resume carries the
   * token too). Each mismatch is acted on once: a refused link (an expired
   * session) is not retried until the seat or the sign-in changes again.
   */
  private syncAccountLink(): void {
    const view = this.snapshot.view
    if (this.snapshot.status !== 'open' || !view?.me) return
    const token = this.accountTokens.read()
    const deviceAccount = token === null ? null : accountIdFromToken(token)
    const seatAccount = view.me.accountId
    if (seatAccount === deviceAccount) {
      this.accountSyncKey = null
      return
    }
    const key = `${seatAccount ?? ''}|${token ?? ''}`
    if (this.accountSyncKey === key) return
    this.accountSyncKey = key
    void this.linkAccount(deviceAccount === null ? null : token).catch(() => {})
  }

  /**
   * Sends `account.link`, sharing a request already in flight for the same
   * token (signing up on the final screen both changes the sign-in, which
   * links automatically, and asks to link). The toast comes with the room's
   * next view of the seat (`accountLinkNotice`), which says where the match
   * went; failures are left to the caller (the sign-up form shows them
   * inline).
   */
  private linkAccount(token: string | null): Promise<void> {
    const current = this.accountLink
    if (current && current.token === token) return current.promise
    const promise = this.run(
      { type: 'account.link', accountToken: token },
      false,
    )
    const request: AccountLinkRequest = { token, promise }
    this.accountLink = request
    const settle = () => {
      if (this.accountLink === request) this.accountLink = null
    }
    promise.then(settle, settle)
    return promise
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
      case 'error': {
        const message = unattributedErrorToast(event.error)
        if (message !== null) this.pushToast(message, 'error')
        return
      }
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
      replaceWord: (optionId, reason) => {
        const promise = this.run({ type: 'draft.replace', optionId, reason })
        // "Seen it" as drawer, once the room accepts it: like an account's
        // report, this browser is not dealt the word as drawer again.
        if (reason === 'seen-before' && isRecordableWordId(optionId)) {
          promise.then(
            () => recordWordHistory({ avoid: [optionId] }),
            () => {},
          )
        }
        return promise
      },
      guess: (text) => {
        const promise = this.guessPacer.submit(text)
        promise.catch(() => {})
        return promise
      },
      voteHint: (approve) =>
        this.run({ type: 'hint.vote', hint: 'word-length', approve }),
      voteSurrender: (approve) => this.run({ type: 'surrender.vote', approve }),
      continueRound: () => this.run({ type: 'round.continue' }),
      rematch: (mode) => this.run({ type: 'rematch.vote', mode }),
      linkAccount: (accountToken) => this.linkAccount(accountToken),
      sendDrawing: (canvasId, ops) =>
        this.canvasStore.queueLocalOps(canvasId, ops),
      reclaim: () => this.connection?.reclaim(),
      dismissToast: (id) => this.dismissToast(id),
    }
  }
}

/** What changed for the seat once the room accepted an `account.link`. */
/**
 * The toast for a change in this seat's account link, read from two
 * consecutive views of the same seat (null when the link did not change).
 * It says only what the room recorded: on the final screen, whether this
 * account got the match (`me.matchCredit`), or that only the next matches
 * count because the seat did not play it or another account already has it.
 */
export function accountLinkNotice(
  previous: RoomView | null,
  next: RoomView,
): string | null {
  const before = previous?.me
  const after = next.me
  if (!before || !after || before.memberId !== after.memberId) return null
  if (before.accountId === after.accountId) return null
  const username = after.accountId
  if (username === null) {
    return 'Signed out: this seat no longer saves stats.'
  }
  if (next.phase === 'lobby') {
    return `Signed in as @${username}: your matches here will be saved.`
  }
  // During a match, linking credits the rounds so far and the rest of it.
  const credit = after.matchCredit ?? null
  if (credit === null || credit.savedTo === username) {
    return `Saved to @${username}: this match is in your stats.`
  }
  const nextOnly = `Signed in as @${username}: your next matches here will be saved.`
  return credit.savedTo === null
    ? nextOnly
    : `${nextOnly} This one stays saved to @${credit.savedTo}.`
}

/** The canvas this member may draw on right now, per the room's view. */
export function drawableCanvasId(view: RoomView | null): string | null {
  if (!view) return null
  if (view.phase === 'drawing' && view.round?.mine?.canDraw) {
    return view.round.mine.canvasId
  }
  if (view.phase === 'showdown' && view.showdown?.mine?.canDraw) {
    return view.showdown.mine.canvasId
  }
  return null
}

/**
 * What to show for a room error that no pending command claimed. A
 * `BAD_COMMAND` without a command means the room could not read a message
 * at all (garbled, or over its size cap before it closes the socket): there
 * is nothing the player can do about it, and any command it belonged to
 * reports through its own caller (`TOO_LARGE`, or a timeout), so it is not
 * shown. Other errors carry the room's own plain-language message.
 */
export function unattributedErrorToast(error: RoomCommandError): string | null {
  if (error.code === 'BAD_COMMAND' && error.commandId === null) return null
  return error.message
}
