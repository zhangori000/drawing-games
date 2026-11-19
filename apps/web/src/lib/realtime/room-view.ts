import type { RoomPhase, RoomView } from '@drawing-games/game-core'

import { isRecord } from '../browser-storage'

const PHASES: ReadonlySet<string> = new Set<RoomPhase>([
  'lobby',
  'word-draft',
  'drawing',
  'round-results',
  'showdown',
  'stats',
])

/**
 * Structural check for a `room.snapshot` state. The protocol only promises
 * JSON here (the view is game-core's to define), so this guards the fields
 * every screen dereferences unconditionally and trusts the projection for
 * the rest.
 */
export function isRoomView(value: unknown): value is RoomView {
  if (!isRecord(value)) return false
  if (typeof value.roomCode !== 'string') return false
  if (typeof value.seq !== 'number') return false
  if (typeof value.phase !== 'string' || !PHASES.has(value.phase)) return false
  if (!Array.isArray(value.members)) return false
  if (!isRecord(value.settings)) return false
  const teams = value.teams
  return isRecord(teams) && isRecord(teams.A) && isRecord(teams.B)
}
