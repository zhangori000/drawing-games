import {
  DIFFICULTY_BONUSES,
  type WordDifficulty,
} from '@drawing-games/game-core'

import { cx } from '@/components/ui/cx'

import { DIFFICULTY_LABELS } from '../../_lib/format'

const STYLES: Readonly<Record<WordDifficulty, string>> = {
  easy: 'bg-[#d8f3e7] text-[#0d5c41]',
  medium: 'bg-[#fff0bf] text-[#6b4a00]',
  hard: 'bg-[#ffd9e8] text-[#8f1046]',
}

/** Filled pips (1–3) so difficulty reads without color too. */
const PIPS: Readonly<Record<WordDifficulty, number>> = {
  easy: 1,
  medium: 2,
  hard: 3,
}

export interface DifficultyChipProps {
  readonly difficulty: WordDifficulty
  /** Append the solve bonus, e.g. "Hard · +40 pts". */
  readonly showBonus?: boolean
  readonly size?: 'sm' | 'md'
  readonly className?: string
}

export function DifficultyChip({
  difficulty,
  showBonus = false,
  size = 'sm',
  className,
}: DifficultyChipProps) {
  const bonus = DIFFICULTY_BONUSES[difficulty]
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-[#181713] font-black',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        STYLES[difficulty],
        className,
      )}
    >
      <span aria-hidden="true" className="flex gap-0.5">
        {[1, 2, 3].map((pip) => (
          <span
            key={pip}
            className={cx(
              'block size-1.5 rounded-full',
              pip <= PIPS[difficulty] ? 'bg-current' : 'bg-current opacity-20',
            )}
          />
        ))}
      </span>
      {DIFFICULTY_LABELS[difficulty]}
      {showBonus && bonus > 0 ? (
        <span className="font-mono tabular-nums">+{bonus} pts</span>
      ) : null}
    </span>
  )
}
