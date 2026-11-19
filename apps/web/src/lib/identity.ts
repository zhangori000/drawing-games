import {
  isRecord,
  listKeys,
  readJson,
  readString,
  removeKey,
  writeJson,
  writeString,
} from './browser-storage'
import { randomId } from './random-id'

/**
 * Room seats and per-tab identity.
 *
 * A seat is the room's answer to `room.join`: the member id plus the opaque
 * resume token that re-binds a new socket to that member. The resume token is
 * a bearer secret: never log it, render it, or send it anywhere except a
 * `room.resume` command to its own room.
 *
 * Storage layout (localStorage unless noted):
 * - `dd.seat.<CODE>`            the most recent seat in this browser
 * - `dd.seat.<CODE>.<memberId>` every seat, so several tabs can each hold one
 * - `dd.tab.<CODE>` (session)   memberId of the seat this tab is playing as
 * - `dd.displayName`            the last name the player typed
 * - `dd.session` / `dd.clientSeq` (session) the protocol session for this tab
 */
export interface Seat {
  readonly memberId: string
  readonly resumeToken: string
  readonly displayName: string
  readonly savedAtMs: number
}

const SEAT_PREFIX = 'dd.seat.'
const TAB_PREFIX = 'dd.tab.'
const DISPLAY_NAME_KEY = 'dd.displayName'
const SESSION_ID_KEY = 'dd.session'
const CLIENT_SEQ_KEY = 'dd.clientSeq'
/** Rooms are deleted after 6 idle hours; a week covers any real comeback. */
const SEAT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const MEMBER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const RESUME_TOKEN_PATTERN = /^[A-Za-z0-9_.-]{16,256}$/
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

function latestSeatKey(roomCode: string): string {
  return `${SEAT_PREFIX}${roomCode}`
}

function memberSeatKey(roomCode: string, memberId: string): string {
  return `${SEAT_PREFIX}${roomCode}.${memberId}`
}

function tabKey(roomCode: string): string {
  return `${TAB_PREFIX}${roomCode}`
}

function parseSeat(value: unknown): Seat | null {
  if (!isRecord(value)) return null
  const { memberId, resumeToken, displayName, savedAtMs } = value
  if (typeof memberId !== 'string' || !MEMBER_ID_PATTERN.test(memberId)) {
    return null
  }
  if (
    typeof resumeToken !== 'string' ||
    !RESUME_TOKEN_PATTERN.test(resumeToken)
  ) {
    return null
  }
  return {
    memberId,
    resumeToken,
    displayName: typeof displayName === 'string' ? displayName : '',
    savedAtMs: typeof savedAtMs === 'number' ? savedAtMs : 0,
  }
}

/** The most recently saved seat for this room in this browser, if any. */
export function loadLatestSeat(roomCode: string): Seat | null {
  return parseSeat(readJson('local', latestSeatKey(roomCode)))
}

/** The seat this tab already plays as (survives refresh), if any. */
export function loadTabSeat(roomCode: string): Seat | null {
  const memberId = readString('session', tabKey(roomCode))
  if (!memberId) return null
  const latest = loadLatestSeat(roomCode)
  if (latest?.memberId === memberId) return latest
  return parseSeat(readJson('local', memberSeatKey(roomCode, memberId)))
}

/** Marks this tab as playing `memberId` (the "Continue as X" choice). */
export function claimSeatForTab(roomCode: string, memberId: string): void {
  writeString('session', tabKey(roomCode), memberId)
}

export function saveSeat(
  roomCode: string,
  seat: Omit<Seat, 'savedAtMs'>,
  nowMs = Date.now(),
): Seat {
  const stored: Seat = { ...seat, savedAtMs: nowMs }
  writeJson('local', latestSeatKey(roomCode), stored)
  writeJson('local', memberSeatKey(roomCode, seat.memberId), stored)
  claimSeatForTab(roomCode, seat.memberId)
  pruneExpiredSeats(nowMs)
  return stored
}

/** Keeps the remembered name in sync with the room's de-duplicated name. */
export function updateSeatDisplayName(
  roomCode: string,
  memberId: string,
  displayName: string,
): void {
  for (const key of [
    latestSeatKey(roomCode),
    memberSeatKey(roomCode, memberId),
  ]) {
    const seat = parseSeat(readJson('local', key))
    if (
      seat &&
      seat.memberId === memberId &&
      seat.displayName !== displayName
    ) {
      writeJson('local', key, { ...seat, displayName })
    }
  }
}

/**
 * Forgets a seat (after leaving, or when the room no longer recognizes it).
 * Defaults to this tab's seat.
 */
export function forgetSeat(roomCode: string, memberId?: string): void {
  const target =
    memberId ??
    readString('session', tabKey(roomCode)) ??
    loadLatestSeat(roomCode)?.memberId
  if (!target) return

  removeKey('local', memberSeatKey(roomCode, target))
  if (loadLatestSeat(roomCode)?.memberId === target) {
    removeKey('local', latestSeatKey(roomCode))
  }
  if (readString('session', tabKey(roomCode)) === target) {
    removeKey('session', tabKey(roomCode))
  }
}

function pruneExpiredSeats(nowMs: number): void {
  for (const key of listKeys('local')) {
    if (!key.startsWith(SEAT_PREFIX)) continue
    const seat = parseSeat(readJson('local', key))
    if (!seat || nowMs - seat.savedAtMs > SEAT_MAX_AGE_MS) {
      removeKey('local', key)
    }
  }
}

export function getRememberedDisplayName(): string {
  return readString('local', DISPLAY_NAME_KEY)?.slice(0, 24) ?? ''
}

export function rememberDisplayName(displayName: string): void {
  const trimmed = displayName.trim().slice(0, 24)
  if (trimmed) writeString('local', DISPLAY_NAME_KEY, trimmed)
}

/** Random, opaque protocol session id for this tab (kept across refreshes). */
export function getTabSessionId(): string {
  const existing = readString('session', SESSION_ID_KEY)
  if (existing && SESSION_ID_PATTERN.test(existing)) return existing
  const created = randomId()
  writeString('session', SESSION_ID_KEY, created)
  return created
}

/**
 * Last client sequence number used by this tab's session. Persisted so a
 * refresh keeps `clientSeq` increasing for the same `sessionId`.
 */
export function loadClientSeq(): number {
  const value = Number(readString('session', CLIENT_SEQ_KEY))
  return Number.isSafeInteger(value) && value > 0 ? value : 0
}

export function storeClientSeq(value: number): void {
  writeString('session', CLIENT_SEQ_KEY, String(value))
}
