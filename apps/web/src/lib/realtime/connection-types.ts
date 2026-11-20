import type { RoomView, TeamId } from '@drawing-games/game-core'
import type {
  CanvasOpsPayload,
  CanvasPreviewPayload,
  CanvasSnapshotPayload,
  ClientCommand,
  GuessFeedbackPayload,
} from '@drawing-games/protocol'

import type { Seat } from '../identity'
import type { RoomCommandError } from './command-error'

/**
 * - `connecting` / `reconnecting`: no bound socket yet (first try / retrying).
 * - `needs-join`: connected (or retrying) without a seat; call `join()` or
 *   `resumeSavedSeat()`.
 * - `joining`: a `room.join` is on its way.
 * - `open`: the socket is bound to this tab's member.
 * - `replaced`: another tab took this seat (close 4001). Never auto-retried;
 *   call `reclaim()`.
 * - `not-found`: the room does not exist (close 4404 / ROOM_NOT_FOUND).
 * - `removed`: the host removed this member (close 4003). The seat is
 *   forgotten and nothing reconnects; `leave()` offers a fresh join.
 * - `unauthorized`: transient — the room rejected the saved seat; the token is
 *   forgotten and the status moves straight on to `needs-join`.
 * - `closed`: `dispose()` or `leave()` ended this connection.
 */
export type RoomConnectionStatus =
  | 'connecting'
  | 'needs-join'
  | 'joining'
  | 'open'
  | 'reconnecting'
  | 'replaced'
  | 'not-found'
  | 'removed'
  | 'unauthorized'
  | 'closed'

export type HandshakeCommandType = 'room.join' | 'room.resume'
export type RoomCommand = Exclude<
  ClientCommand,
  { readonly type: HandshakeCommandType }
>
export type AckStatus = 'applied' | 'duplicate'

export interface JoinParams {
  readonly displayName: string
  readonly team?: TeamId
}

export interface SavedSeatSummary {
  readonly memberId: string
  readonly displayName: string
}

export interface RoomConnectionState {
  readonly status: RoomConnectionStatus
  readonly view: RoomView | null
  readonly memberId: string | null
  /** A seat saved by another tab, offered as "Continue as X". */
  readonly savedSeat: SavedSeatSummary | null
}

export type RoomConnectionEvent =
  | { readonly type: 'session.issued'; readonly memberId: string }
  | {
      readonly type: 'canvas.snapshot'
      readonly payload: CanvasSnapshotPayload
    }
  | { readonly type: 'canvas.ops'; readonly payload: CanvasOpsPayload }
  | { readonly type: 'canvas.preview'; readonly payload: CanvasPreviewPayload }
  | { readonly type: 'guess.feedback'; readonly payload: GuessFeedbackPayload }
  /** A server error not tied to any command this tab is waiting on. */
  | { readonly type: 'error'; readonly error: RoomCommandError }
  | { readonly type: 'notice'; readonly notice: RoomConnectionNotice }

export type RoomConnectionNotice =
  /** The saved seat was rejected (removed from the room, or room reset). */
  | 'seat-expired'
  /** Another tab or device opened this seat. */
  | 'replaced'
  /** The host removed this member from the room. */
  | 'removed'

/** The subset of `WebSocket` the connection uses (injectable for tests). */
export interface WebSocketLike {
  readonly readyState: number
  readonly bufferedAmount: number
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { readonly data: unknown }) => void) | null
  onclose:
    ((event: { readonly code: number; readonly reason: string }) => void) | null
  onerror: ((event: unknown) => void) | null
  send(data: string): void
  close(code?: number, reason?: string): void
}

export interface SeatStore {
  loadTabSeat(roomCode: string): Seat | null
  loadLatestSeat(roomCode: string): Seat | null
  saveSeat(roomCode: string, seat: Omit<Seat, 'savedAtMs'>): void
  claimSeatForTab(roomCode: string, memberId: string): void
  updateSeatDisplayName(
    roomCode: string,
    memberId: string,
    displayName: string,
  ): void
  forgetSeat(roomCode: string, memberId?: string): void
}

export interface ClientSeqStore {
  load(): number
  store(value: number): void
}

export interface TimerApi {
  setTimeout(callback: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export interface RoomConnectionOptions {
  readonly roomCode: string
  /** Quick-account bearer token to send on join/resume, if signed in. */
  readonly getAccountToken?: () => string | null
  /**
   * This browser's word history sent on join, newest first: `avoid` (words
   * it drew or reported "seen it") and `soft` (the rest it met).
   */
  readonly getWordHistory?: () => {
    readonly avoid: readonly string[]
    readonly soft: readonly string[]
  }
  readonly createSocket?: (url: string) => WebSocketLike
  readonly socketUrl?: (roomCode: string, sessionId: string) => string
  readonly seats?: SeatStore
  readonly sessionId?: string
  readonly clientSeqStore?: ClientSeqStore
  readonly timers?: TimerApi
  readonly now?: () => number
  readonly random?: () => number
  /** Calls `wake` when the page becomes visible/online again. */
  readonly lifecycle?: ((wake: (info?: WakeInfo) => void) => () => void) | null
  readonly commandTimeoutMs?: number
}

export interface WakeInfo {
  /** How long the page was hidden before this wake, if it was hidden. */
  readonly hiddenForMs?: number
}

export interface SendOptions {
  /** Milliseconds to wait for the ack; `null` waits for as long as it takes. */
  readonly timeoutMs?: number | null
  /**
   * Checked before every write, including resends after a reconnect (which
   * wait for the room's first view after the bind, so the check sees fresh
   * state). When it returns false the command is dropped with `STALE`.
   */
  readonly isCurrent?: () => boolean
}
