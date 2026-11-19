import type { RoomPhase } from '@drawing-games/game-core'

import { isRecord } from '../browser-storage'
import { realtimeHttpUrl } from './config'

const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,8}$/
const ROOM_PHASES: readonly RoomPhase[] = [
  'lobby',
  'word-draft',
  'drawing',
  'round-results',
  'showdown',
  'stats',
]

export interface RoomInfo {
  readonly exists: boolean
  readonly phase: RoomPhase | null
  readonly memberCount: number
}

export class RoomsApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message)
    this.name = 'RoomsApiError'
  }
}

/** Cleans what a person typed: no spaces or dashes, uppercase, max 8. */
export function formatRoomCodeInput(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .slice(0, 8)
}

/** Canonical room code, or null when the input cannot be a room code. */
export function normalizeRoomCodeInput(raw: string): string | null {
  const code = raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '')
  return ROOM_CODE_PATTERN.test(code) ? code : null
}

export async function createRoom(): Promise<string> {
  let body: unknown
  try {
    body = await requestJson('/rooms', { method: 'POST' })
  } catch (error) {
    if (error instanceof RoomsApiError && error.status !== null) {
      throw new RoomsApiError(
        'Couldn’t create a room right now. Try again in a moment.',
        error.status,
      )
    }
    throw error
  }
  const roomCode = isRecord(body) ? body.roomCode : undefined
  if (typeof roomCode !== 'string' || !ROOM_CODE_PATTERN.test(roomCode)) {
    throw new RoomsApiError('The server did not return a room code.', null)
  }
  return roomCode
}

export async function getRoomInfo(code: string): Promise<RoomInfo> {
  const roomCode = normalizeRoomCodeInput(code)
  if (!roomCode) return { exists: false, phase: null, memberCount: 0 }

  let body: unknown
  try {
    body = await requestJson(`/rooms/${roomCode}`, { method: 'GET' })
  } catch (error) {
    if (error instanceof RoomsApiError && error.status === 404) {
      return { exists: false, phase: null, memberCount: 0 }
    }
    throw error
  }

  if (!isRecord(body)) {
    throw new RoomsApiError('The server sent an unexpected response.', null)
  }
  const phase = ROOM_PHASES.find((candidate) => candidate === body.phase)
  return {
    exists: body.exists === true,
    phase: phase ?? null,
    memberCount:
      typeof body.memberCount === 'number' && body.memberCount >= 0
        ? Math.floor(body.memberCount)
        : 0,
  }
}

async function requestJson(path: string, init: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(realtimeHttpUrl(path), {
      ...init,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
  } catch {
    throw new RoomsApiError(
      'Can’t reach the game server. Check your connection and try again.',
      null,
    )
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      isRecord(body) && typeof body.error === 'string'
        ? body.error
        : `The game server answered ${response.status}.`
    throw new RoomsApiError(message, response.status)
  }
  return body
}
