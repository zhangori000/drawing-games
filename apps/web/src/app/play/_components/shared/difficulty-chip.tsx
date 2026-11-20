import {
  DIFFICULTY_BONUSES,
  type WordDifficulty,
} from '@drawing-games/game-core'

import { cx } from '@/components/ui/cx'

import { DIFFICULTY_LABELS, UNRATED_LABEL } from '../../_lib/format'

const STYLES: Readonly<Record<WordDifficulty, string>> = {
  easy: 'bg-[#d8f3e7] text-[#0d5c41]',
  medium: 'bg-[#fff0bf] text-[#6b4a00]',
  hard: 'bg-[#ffd9e8] text-[#8f1046]',
}

/** A host word with no difficulty tag: no rating to show, only "Custom". */
const UNRATED_STYLE = 'bg-white text-[#181713]'

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
  /**
   * `xs` is the one-line banner chip used while a keyboard is up: pips plus
   * the bonus ("+40"), or the label when there is no bonus.
   */
  readonly size?: 'xs' | 'sm' | 'md'
  /**
   * A host custom word without a difficulty tag: shows "Custom" (with the
   * medium bonus it scores) instead of a rating the host never gave.
   */
  readonly unrated?: boolean
  readonly className?: string
}

export function DifficultyChip({
  difficulty,
  showBonus = false,
  size = 'sm',
  unrated = false,
  className,
}: DifficultyChipProps) {
  const bonus = DIFFICULTY_BONUSES[difficulty]
  const label = unrated ? UNRATED_LABEL : DIFFICULTY_LABELS[difficulty]
  const style = unrated ? UNRATED_STYLE : STYLES[difficulty]
  if (size === 'xs') {
    return (
      <span
        className={cx(
          'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 border-[#181713] px-1.5 text-[11px] font-black leading-5',
          style,
          className,
        )}
      >
        {unrated ? null : <Pips difficulty={difficulty} />}
        <span className="sr-only">
          {label}
          {showBonus && bonus > 0 ? `, +${bonus} points` : ''}
        </span>
        <span aria-hidden="true">
          {showBonus && bonus > 0 ? (
            <span className="font-mono tabular-nums">+{bonus}</span>
          ) : (
            label
          )}
        </span>
      </span>
    )
  }
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-[#181713] font-black',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        style,
        className,
      )}
    >
      {unrated ? null : <Pips difficulty={difficulty} />}
      {label}
      {showBonus && bonus > 0 ? (
        <span className="font-mono tabular-nums">+{bonus} pts</span>
      ) : null}
    </span>
  )
}

function Pips({ difficulty }: { readonly difficulty: WordDifficulty }) {
  return (
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
  )
}
