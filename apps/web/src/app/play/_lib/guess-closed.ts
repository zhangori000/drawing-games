import type {
  MyTeamRoundView,
  ShowdownMineView,
} from '@drawing-games/game-core'

/**
 * Why a guesser's box is off during the drawing phase, in the room's own
 * terms (null while they may guess). It is the input's placeholder and the
 * status line under it, so keep it short.
 */
export function roundGuessClosedReason(
  mine: Pick<MyTeamRoundView, 'canGuess' | 'solved' | 'sittingOut'>,
  opponentName: string,
): string | null {
  if (mine.canGuess) return null
  if (mine.solved) return `Solved! Now watch ${opponentName} scramble.`
  // Drew this word before someone took over the turn (see the room rules).
  if (mine.sittingOut === 'former-drawer') {
    return 'You saw this word as the drawer. Guess next round!'
  }
  return 'Guessing is closed.'
}

/** Like `roundGuessClosedReason`, for the active Showdown card. */
export function showdownGuessClosedReason(
  mine: Pick<ShowdownMineView, 'canGuess' | 'finished' | 'sittingOut'>,
): string | null {
  if (mine.canGuess) return null
  if (mine.finished) return 'Your team is done. Cheer them on!'
  if (mine.sittingOut === 'former-drawer') {
    return 'You saw this card as the drawer. Guess the next one!'
  }
  return 'Guessing is closed.'
}
