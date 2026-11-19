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
 * `roster[turn % length]`, skipping members past their reconnect grace. If
 * nobody qualifies the base pick stands. An empty roster (everyone left
 * mid-match) falls back to the team's former members.
 */
export function pickRotationMember(
  state: RoomState,
  team: TeamId,
  turn: number,
  now: number,
): RoomMember {
  const roster = teamRoster(state, team)
  const candidates =
    roster.length > 0
      ? roster
      : state.members.filter((member) => member.team === team)
  if (candidates.length === 0) throw new Error(`Team ${team} has no members`)
  const base = Math.max(0, turn) % candidates.length
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const member = candidates[(base + offset) % candidates.length] as RoomMember
    if (isWithinGrace(member, now)) return member
  }
  return candidates[base] as RoomMember
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

function cleanIds(ids: unknown, limit: number): string[] {
  if (!Array.isArray(ids)) return []
  const unique: string[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue
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
