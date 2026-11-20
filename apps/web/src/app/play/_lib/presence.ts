import type { MemberView, TeamId } from '@drawing-games/game-core'

export interface TurnPresenceInput {
  readonly members: readonly MemberView[]
  readonly team: TeamId
  readonly meId: string
  /** The team's drawer for this turn (null between Showdown cards). */
  readonly drawerId: string | null
  readonly amDrawer: boolean
  /** The team solved its word or cleared its cards: nobody is waiting. */
  readonly done: boolean
}

export interface TurnPresenceNotice {
  /** One line for the guess dock's status or the drawer's feed. */
  readonly message: string
  /** Replaces "Cleo is drawing" in a guesser's banner; null for the drawer. */
  readonly short: string | null
}

/**
 * What to tell a player whose turn partner is offline, since the round
 * clock keeps running (a single disconnect never pauses the match). A
 * guesser whose drawer lost connection hears so, during the drawer's
 * reconnect grace and for as long as the turn waits for them (no teammate
 * to take over); once someone takes over, the new drawer's name replaces
 * it. A drawer whose teammates are all offline hears that nobody can guess.
 * Bots are always connected. Null when there is nothing to say.
 */
export function turnPresenceNotice(
  input: TurnPresenceInput,
): TurnPresenceNotice | null {
  if (input.done) return null
  if (input.amDrawer) {
    const guessers = input.members.filter(
      (member) => member.team === input.team && member.id !== input.meId,
    )
    if (guessers.length === 0 || guessers.some((member) => member.connected)) {
      return null
    }
    return {
      message:
        'Nobody on your team is online to guess right now. Keep drawing for when they’re back.',
      short: null,
    }
  }
  if (input.drawerId === null || input.drawerId === input.meId) return null
  const drawer = input.members.find((member) => member.id === input.drawerId)
  if (!drawer || drawer.connected) return null
  return {
    message: `${drawer.displayName} lost connection. Waiting for them to come back.`,
    short: `${drawer.displayName} lost connection`,
  }
}
