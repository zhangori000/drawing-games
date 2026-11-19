import { otherTeam, type RoomView, type TeamId } from '@drawing-games/game-core'

import { readString, writeString } from '@/lib/browser-storage'

/**
 * Practice mode (`/play/CODE?practice=1` from the home page): a solo host
 * gets one bot teammate and two bot opponents, so 2 v 2 is ready to start.
 */
const PRACTICE_KEY_PREFIX = 'dd.practice.'
const claimedThisPage = new Set<string>()

/**
 * The teams to add bots to, in order, or null when this room is not a fresh
 * solo practice room (someone else is here, bots already exist, or I am not
 * the host of a lobby).
 */
export function practiceBotPlan(view: RoomView): readonly TeamId[] | null {
  const me = view.me
  if (view.phase !== 'lobby' || !me?.isHost) return null
  if (view.members.length !== 1 || view.members[0]?.id !== me.memberId) {
    return null
  }
  const rival = otherTeam(me.team)
  return [me.team, rival, rival]
}

/**
 * Marks practice setup as done for this room in this tab. Returns false if it
 * was already claimed, so re-renders, reconnects, and refreshes never add a
 * second set of bots.
 */
export function claimPracticeSetup(roomCode: string): boolean {
  const key = `${PRACTICE_KEY_PREFIX}${roomCode}`
  // The in-memory set covers browsers where sessionStorage is unavailable.
  if (claimedThisPage.has(key) || readString('session', key) === '1') {
    return false
  }
  claimedThisPage.add(key)
  writeString('session', key, '1')
  return true
}
