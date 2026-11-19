import type { GuessView } from '@drawing-games/game-core'

import { cx } from '@/components/ui/cx'

import { usePlayLayout } from './play-layout'

export interface GuessFeedProps {
  readonly guesses: readonly GuessView[]
  readonly label: string
  readonly emptyText: string
  /** Smaller rows without a heading; defaults to the phone layout. */
  readonly compact?: boolean
}

const VERDICT_BADGES = {
  close: { text: 'So close', className: 'bg-[#f8ff80] text-[#181713]' },
  partial: { text: 'Part right', className: 'bg-[#ffe3a3] text-[#5c3d00]' },
} as const

/**
 * The team's guesses, newest at the bottom and kept in view without
 * scripting: a column-reverse scroller starts at its end. Correct guesses
 * never show their text, only who got it.
 */
export function GuessFeed({
  guesses,
  label,
  emptyText,
  compact: compactProp,
}: GuessFeedProps) {
  const layout = usePlayLayout()
  const compact = compactProp ?? layout !== 'wide'
  return (
    <section aria-label={label} className="flex min-h-0 flex-1 flex-col">
      {compact ? null : (
        <h2 className="mb-1.5 shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-black/55">
          {label}
        </h2>
      )}
      <div
        className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain"
        data-testid="guess-feed"
      >
        {guesses.length === 0 ? (
          <p className={cx('text-black/45', compact ? 'text-xs' : 'text-sm')}>
            {emptyText}
          </p>
        ) : (
          <ol
            aria-live="polite"
            aria-relevant="additions"
            className="flex flex-col gap-0.5"
          >
            {guesses.map((guess) => (
              <GuessRow key={guess.id} guess={guess} compact={compact} />
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function GuessRow({
  guess,
  compact,
}: {
  readonly guess: GuessView
  readonly compact: boolean
}) {
  const who = guess.mine ? 'You' : guess.memberName
  if (guess.verdict === 'correct') {
    return (
      <li
        className={cx(
          'flex items-center gap-1.5 rounded-lg border-2 border-[#181713] bg-[#1f9d72] px-2 font-black text-white',
          compact ? 'py-0 text-xs' : 'py-1 text-sm',
        )}
      >
        <span aria-hidden="true">✓</span>
        <span className="truncate">{who} guessed it!</span>
      </li>
    )
  }
  const badge = guess.verdict === 'wrong' ? null : VERDICT_BADGES[guess.verdict]
  return (
    <li
      className={cx(
        'flex min-w-0 items-baseline gap-1.5 px-1',
        compact ? 'text-xs' : 'text-sm',
      )}
    >
      <span className="shrink-0 font-black">{who}</span>
      <span className="min-w-0 truncate text-black/75">{guess.text}</span>
      {badge ? (
        <span
          className={cx(
            'shrink-0 rounded-full border border-[#181713] px-1.5 text-[10px] font-black uppercase tracking-wider',
            badge.className,
          )}
        >
          {badge.text}
        </span>
      ) : null}
    </li>
  )
}
