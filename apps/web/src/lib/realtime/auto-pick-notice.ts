import {
  DIFFICULTY_BONUSES,
  type RoomView,
  type WordDifficulty,
} from '@drawing-games/game-core'

const LABELS: Readonly<Record<WordDifficulty, string>> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

/**
 * When the draft clock runs out before this drawer picks, the room picks a
 * card for them and the screen jumps straight to drawing. This says so, once,
 * on that switch: "Time's up! We picked paper shredder (Hard +40) for you."
 * Null for every other view change (a reload mid-round included; the word
 * banner keeps a short note for the whole round).
 */
export function autoPickNotice(
  previous: RoomView | null,
  next: RoomView,
): string | null {
  if (!previous?.me || !next.me) return null
  if (previous.me.memberId !== next.me.memberId) return null
  if (previous.phase !== 'word-draft' || next.phase !== 'drawing') return null
  if ((previous.match?.number ?? null) !== (next.match?.number ?? null)) {
    return null
  }
  const before = previous.round
  const after = next.round
  if (!before?.mine?.amDrawer || !after?.mine?.amDrawer) return null
  if (before.number !== after.number) return null
  const word = after.mine.word
  if (!word?.autoPicked) return null
  const bonus = DIFFICULTY_BONUSES[word.difficulty]
  const stake =
    bonus > 0 ? `${LABELS[word.difficulty]} +${bonus}` : LABELS[word.difficulty]
  return `Time’s up! We picked ${word.term} (${stake}) for you.`
}
