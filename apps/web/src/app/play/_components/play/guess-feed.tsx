import type { GuessView } from '@drawing-games/game-core'

import { GUESS_PRIVACY_NOTE } from '@/components/guess/guess-dock'
import { cx } from '@/components/ui/cx'

import { usePlayChrome, usePlayLayout } from './play-layout'

export interface GuessFeedProps {
  readonly guesses: readonly GuessView[]
  readonly label: string
  readonly emptyText: string
  /**
   * Pinned above the guesses, e.g. that nobody on the team is online to
   * guess (see `turnPresenceNotice`).
   */
  readonly notice?: string | null
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
  notice = null,
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
      <p role="status" className={cx(notice && 'mb-1 shrink-0')}>
        {notice ? <PresenceNote text={notice} wrap /> : null}
      </p>
      <div
        className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain"
        data-testid="guess-feed"
      >
        {guesses.length === 0 ? (
          notice ? null : (
            <p className={cx('text-black/45', compact ? 'text-xs' : 'text-sm')}>
              {emptyText}
            </p>
          )
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
  // The room sends near-miss verdicts only to the guesser and the drawer;
  // everyone else already gets these guesses as plain "wrong".
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

/**
 * A teammate the turn depends on is offline (`turnPresenceNotice`): a
 * drawer who lost connection, or no guesser online.
 */
export function PresenceNote({
  text,
  wrap = false,
}: {
  readonly text: string
  /** Wrap instead of truncating (the feed has room; the dock line not). */
  readonly wrap?: boolean
}) {
  return (
    <span
      data-testid="presence-note"
      className={cx(
        'rounded-lg bg-[#ffd9cf] px-2 py-0.5 text-xs font-bold text-[#181713]',
        wrap ? 'block leading-4' : 'truncate',
      )}
    >
      {text}
    </span>
  )
}

/**
 * The guess dock's idle status line. While a keyboard has pushed the feed
 * off a phone screen (portrait, or landscape with the device keyboard), it
 * shows the newest teammate guess so the team chatter stays visible;
 * otherwise the usual privacy note.
 */
export function LatestTeamGuess({
  guesses,
}: {
  readonly guesses: readonly GuessView[]
}) {
  const { feedInDock } = usePlayChrome()
  const latest = feedInDock
    ? guesses.findLast((guess) => !guess.mine)
    : undefined
  if (!latest) {
    return (
      <span className="truncate px-1 text-xs text-black/45">
        {GUESS_PRIVACY_NOTE}
      </span>
    )
  }
  if (latest.verdict === 'correct') {
    return (
      <span
        data-testid="latest-team-guess"
        className="truncate px-1 text-xs font-black text-[#1f9d72]"
      >
        ✓ {latest.memberName} guessed it!
      </span>
    )
  }
  return (
    <span
      data-testid="latest-team-guess"
      className="flex min-w-0 items-baseline gap-1.5 px-1 text-xs"
    >
      <span className="shrink-0 font-black">{latest.memberName}</span>
      <span className="min-w-0 truncate text-black/75">{latest.text}</span>
    </span>
  )
}
