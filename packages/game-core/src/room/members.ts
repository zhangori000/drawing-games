import { canonicalWordId } from '@drawing-games/word-bank'

import type { TeamId } from '../types'
import { RECONNECT_GRACE_MS } from './constants'
import type { PlayerWordMemory } from './records'
import { WORD_MEMORY_LIMITS } from './records'
import type { RoomMember, RoomState } from './types'

/** Members still in the room (left members are kept only for history). */
export function activeMembers(state: RoomState): RoomMember[] {
  return state.members.filter((member) => member.left !== true)
}

export function findMember(
  state: RoomState,
  memberId: string,
): RoomMember | undefined {
  return state.members.find((member) => member.id === memberId)
}

export function findActiveMember(
  state: RoomState,
  memberId: string,
): RoomMember | undefined {
  const member = findMember(state, memberId)
  return member === undefined || member.left === true ? undefined : member
}

/** Rotation order: join order filtered to the team, without left members. */
export function teamRoster(state: RoomState, team: TeamId): RoomMember[] {
  return activeMembers(state).filter((member) => member.team === team)
}

/** Connected, or disconnected for no longer than the reconnect grace. */
export function isWithinGrace(member: RoomMember, now: number): boolean {
  return member.connected || now - member.lastSeenAtMs <= RECONNECT_GRACE_MS
}

/**
 * Every member ever on `team` in rotation (join) order, starting with the
 * one after `afterId` and ending with `afterId` itself; from the first
 * member when `afterId` is null or not on the team. Left members are kept
 * so a former drawer still marks the cursor; callers filter them out.
 */
function rotationFrom(
  state: RoomState,
  team: TeamId,
  afterId: string | null,
): RoomMember[] {
  const order = state.members.filter((member) => member.team === team)
  const start =
    afterId === null ? -1 : order.findIndex((member) => member.id === afterId)
  return [...order.slice(start + 1), ...order.slice(0, start + 1)]
}

/**
 * The team's next drawer after `afterId`, its previous drawer (null for the
 * first turn): the first member after them in join order who is within the
 * reconnect grace. So everyone draws once per cycle, a member who is away
 * is skipped without anyone drawing twice in a row while a teammate within
 * grace is waiting, and a mid-match joiner slots in at their join position.
 * Left members are skipped. If nobody is within grace the next remaining
 * member draws; if everyone left, the next former member keeps the seat.
 */
export function nextRotationDrawer(
  state: RoomState,
  team: TeamId,
  afterId: string | null,
  now: number,
): RoomMember {
  const order = rotationFrom(state, team, afterId)
  const remaining = order.filter((member) => member.left !== true)
  const pick =
    remaining.find((member) => isWithinGrace(member, now)) ??
    remaining[0] ??
    order[0]
  if (pick === undefined) throw new Error(`Team ${team} has no members`)
  return pick
}

/**
 * The teammate after `drawerId` in rotation order who can take over their
 * turn, or null. `within-grace` (an explicit leave) prefers the first one
 * within the reconnect grace, else any remaining teammate; `connected` (a
 * drawer whose grace ran out) only takes someone who is here right now.
 */
export function nextTeammate(
  state: RoomState,
  team: TeamId,
  drawerId: string,
  now: number,
  mode: 'within-grace' | 'connected' = 'within-grace',
): RoomMember | null {
  const after = rotationFrom(state, team, drawerId).filter(
    (member) => member.left !== true && member.id !== drawerId,
  )
  if (mode === 'connected') {
    return after.find((member) => member.connected) ?? null
  }
  return after.find((member) => isWithinGrace(member, now)) ?? after[0] ?? null
}

/** Display name for any member ever in the room, including left members. */
export function memberName(state: RoomState, memberId: string): string {
  return findMember(state, memberId)?.displayName ?? 'Former player'
}

/** Earliest-joined connected human, else any human, else null. */
export function chooseHost(
  state: RoomState,
  excludeId: string | null = null,
): string | null {
  const humans = activeMembers(state).filter(
    (member) => member.kind === 'human' && member.id !== excludeId,
  )
  return (humans.find((member) => member.connected) ?? humans[0])?.id ?? null
}

/** Valid, de-duplicated ids; a word that moved packs gets its new id. */
function cleanIds(ids: unknown, limit: number): string[] {
  if (!Array.isArray(ids)) return []
  const unique: string[] = []
  const seen = new Set<string>()
  for (const raw of ids) {
    if (typeof raw !== 'string' || raw.length === 0) continue
    const id = canonicalWordId(raw)
    if (seen.has(id)) continue
    seen.add(id)
    unique.push(id)
  }
  return unique.slice(Math.max(0, unique.length - limit))
}

/** De-duplicated, capped copy (newest entries, at the end, are kept). */
export function capMemory(
  memory: PlayerWordMemory | undefined,
): PlayerWordMemory {
  return {
    avoid: cleanIds(memory?.avoid, WORD_MEMORY_LIMITS.avoid),
    soft: cleanIds(memory?.soft, WORD_MEMORY_LIMITS.soft),
  }
}

export function mergeMemory(
  current: PlayerWordMemory,
  incoming: PlayerWordMemory,
): PlayerWordMemory {
  return capMemory({
    avoid: [...current.avoid, ...incoming.avoid],
    soft: [...current.soft, ...incoming.soft],
  })
}

/** Appends ids to one memory list, moving repeats to the newest position. */
export function rememberWords(
  memory: PlayerWordMemory,
  list: keyof PlayerWordMemory,
  wordIds: readonly string[],
): PlayerWordMemory {
  const incoming = new Set(wordIds)
  const kept = memory[list].filter((id) => !incoming.has(id))
  return capMemory({ ...memory, [list]: [...kept, ...incoming] })
}
