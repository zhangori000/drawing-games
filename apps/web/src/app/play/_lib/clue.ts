import type { HintView } from '@drawing-games/game-core'

/**
 * State of the guessers' "Reveal letters" button. The room's `hint.canVote`
 * is computed when the view was projected and views are only re-sent on
 * change, so the unlock moment is derived from the countdown here and the
 * room still has the final say on every vote.
 */
export type RevealState =
  /** Word length mode is `shown`, or the team already revealed it. */
  | { readonly kind: 'revealed' }
  /** Length mode `hidden`: no vote exists this game. */
  | { readonly kind: 'never' }
  /** The vote opens in `secondsLeft`. */
  | { readonly kind: 'locked'; readonly secondsLeft: number }
  /** The viewer may vote (or withdraw their vote). */
  | { readonly kind: 'open'; readonly voted: boolean }
  /** Voting is over for this viewer (team solved, or not an elector). */
  | { readonly kind: 'closed' }

export interface RevealInput {
  readonly hint: HintView
  /** Whole seconds until `hint.unlocksAtMs`, from the server clock. */
  readonly secondsUntilUnlock: number | null
  readonly solved: boolean
  /** The viewer is guessing this round (not drawing, not a spectator). */
  readonly guessing: boolean
}

export function revealState(input: RevealInput): RevealState {
  const { hint, secondsUntilUnlock, solved, guessing } = input
  if (hint.revealed) return { kind: 'revealed' }
  if (hint.mode === 'hidden') return { kind: 'never' }
  if (hint.mode === 'shown') return { kind: 'revealed' }
  if (solved || !guessing) return { kind: 'closed' }
  if (hint.canVote) return { kind: 'open', voted: hint.myVote === true }
  if (secondsUntilUnlock !== null && secondsUntilUnlock > 0) {
    return { kind: 'locked', secondsLeft: secondsUntilUnlock }
  }
  if (hint.unlocksAtMs === null) return { kind: 'closed' }
  return { kind: 'open', voted: hint.myVote === true }
}

/** `_ _ _   _ _ _` → readable "3 + 3 letters" for screen readers. */
export function describePattern(pattern: string): string {
  const groups = pattern
    .split(/\s{2,}/)
    .map((group) => group.replace(/[^_]/g, '').length)
    .filter((count) => count > 0)
  const total = groups.reduce((sum, count) => sum + count, 0)
  if (groups.length <= 1) return `${total} letters`
  return `${total} letters: ${groups.join(' + ')}`
}

/**
 * `_ _ A   _ _` → `['__A', '__']`: the pattern's words with the letter
 * spacing removed, for the one-line banner shown while a keyboard is up
 * (letter-spacing in CSS keeps the blanks countable at half the width).
 */
export function patternWords(pattern: string): string[] {
  return pattern
    .trim()
    .split(/\s{2,}/)
    .map((word) => word.replace(/\s/g, ''))
    .filter((word) => word.length > 0)
}
