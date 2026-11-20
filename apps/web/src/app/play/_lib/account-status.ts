import type { MeView } from '@drawing-games/game-core'

/**
 * What the final screen may truthfully say about this seat's account and
 * the match just played. It follows the room's own record of where the
 * match went (`me.matchCredit`), never the sign-in alone: a seat that
 * joined after the last round has nothing to save, and a match already
 * saved to one account is never saved again to another.
 */
export type FinalAccountStatus =
  /** Signed in, and this account has the match. */
  | { readonly kind: 'saved'; readonly username: string }
  /** A guest who played and has nothing saved: signing up now saves it. */
  | { readonly kind: 'can-save' }
  /**
   * The match is saved to `savedTo`, which is not the account this seat
   * has now (`username`, null for a guest who signed out since).
   */
  | {
      readonly kind: 'saved-elsewhere'
      readonly savedTo: string
      readonly username: string | null
    }
  /**
   * No account has this match and linking one now would not add it (the
   * seat played none of it), so only later matches can count.
   */
  | {
      readonly kind: 'next-only'
      readonly username: string | null
      readonly played: boolean
    }

export function finalAccountStatus(me: MeView): FinalAccountStatus {
  const username = me.accountId
  // A room that does not report credit yet: fall back to the sign-in.
  const credit = me.matchCredit ?? { played: true, savedTo: username }
  if (credit.savedTo !== null) {
    return credit.savedTo === username
      ? { kind: 'saved', username: credit.savedTo }
      : { kind: 'saved-elsewhere', savedTo: credit.savedTo, username }
  }
  if (credit.played && username === null) return { kind: 'can-save' }
  return { kind: 'next-only', username, played: credit.played }
}

/**
 * Whether the seat played the match on the final screen, so the banner does
 * not cheer ("Your team took it") a player who joined after it.
 */
export function playedFinishedMatch(me: MeView): boolean {
  return me.matchCredit?.played ?? true
}
