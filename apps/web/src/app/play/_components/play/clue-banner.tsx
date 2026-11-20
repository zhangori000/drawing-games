'use client'

import type { HintView, WordDifficulty } from '@drawing-games/game-core'

import { useCountdown } from '@/components/ui/countdown'
import { cx } from '@/components/ui/cx'

import { describePattern, patternWords, revealState } from '../../_lib/clue'
import { useRoomSession } from '../room-session'
import { DifficultyChip } from '../shared/difficulty-chip'
import { BannerTimer } from './banners'
import { usePlayChrome } from './play-layout'

export interface ClueBannerProps {
  readonly drawerName: string
  readonly difficulty: WordDifficulty | null
  readonly category: string | null
  readonly pattern: string | null
  readonly letterCount: number | null
  readonly hint: HintView
  readonly solved: boolean
  readonly guessing: boolean
}

/**
 * What a guesser knows about their word: category, stake, and the letter
 * pattern once shown or revealed — plus the team's reveal vote. While a
 * keyboard is up on a phone it collapses to one 44 px line so the drawing
 * keeps the room.
 */
export function ClueBanner({
  drawerName,
  difficulty,
  category,
  pattern,
  letterCount,
  hint,
  solved,
  guessing,
}: ClueBannerProps) {
  const { serverNow } = useRoomSession()
  const { secondsLeft } = useCountdown(hint.unlocksAtMs, serverNow)
  const reveal = revealState({
    hint,
    secondsUntilUnlock: secondsLeft,
    solved,
    guessing,
  })
  const { compactBanner } = usePlayChrome()

  if (compactBanner) {
    return (
      <div
        data-testid="clue-banner"
        data-compact=""
        className="flex h-11 shrink-0 items-center gap-1.5 border-b-2 border-[#181713] bg-[#fffdf7] px-2"
      >
        <p
          className={cx(
            'flex flex-auto items-baseline gap-1 overflow-hidden whitespace-nowrap',
            // Long patterns may give way a little; "? letters" never does.
            pattern ? 'min-w-0' : 'shrink-0',
          )}
          data-testid="word-pattern"
        >
          {pattern ? (
            <span
              className="flex min-w-0 items-baseline gap-1"
              aria-label={`The word: ${describePattern(pattern)}`}
            >
              <span className="flex min-w-0 gap-2 overflow-hidden font-mono text-base font-black tracking-[0.2em]">
                {patternWords(pattern).map((word, index) => (
                  <span key={index}>{word}</span>
                ))}
              </span>
              <span className="shrink-0 text-[11px] font-bold text-black/50">
                {letterCount}
              </span>
            </span>
          ) : (
            <span className="text-sm font-black">
              <span aria-hidden="true" className="font-mono">
                ?{' '}
              </span>
              letters
            </span>
          )}
        </p>
        {category ? (
          <span className="min-w-10 max-w-[40%] shrink-[4] truncate rounded-full border-2 border-[#181713] bg-white px-1.5 text-[11px] font-black leading-5">
            {category}
          </span>
        ) : null}
        {difficulty ? (
          <DifficultyChip difficulty={difficulty} showBonus size="xs" />
        ) : null}
        <RevealButton reveal={reveal} hint={hint} compact />
        <BannerTimer />
      </div>
    )
  }

  return (
    <div
      data-testid="clue-banner"
      className="flex min-h-[3.75rem] shrink-0 flex-col justify-center gap-1 border-b-2 border-[#181713] bg-[#fffdf7] px-3 py-1.5"
    >
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate" data-testid="word-pattern">
          {pattern ? (
            <span
              className="font-mono text-lg font-black tracking-[0.08em] whitespace-pre"
              aria-label={`The word: ${describePattern(pattern)}`}
            >
              {pattern}
              <span className="ml-2 align-middle text-xs font-bold tracking-normal text-black/50">
                {letterCount}
              </span>
            </span>
          ) : (
            <span className="text-base font-black">
              <span aria-hidden="true" className="font-mono">
                ?{' '}
              </span>
              letters
            </span>
          )}
        </p>
        <RevealButton reveal={reveal} hint={hint} />
      </div>
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs">
        {category ? (
          <span className="shrink-0 rounded-full border-2 border-[#181713] bg-white px-2 py-0.5 font-black">
            {category}
          </span>
        ) : null}
        {difficulty ? (
          <DifficultyChip difficulty={difficulty} showBonus />
        ) : null}
        <span className="min-w-0 truncate font-semibold text-black/55">
          {drawerName} is drawing
        </span>
      </div>
    </div>
  )
}

function RevealButton({
  reveal,
  hint,
  compact = false,
}: {
  readonly reveal: ReturnType<typeof revealState>
  readonly hint: HintView
  /** Shorter label for the one-line banner. */
  readonly compact?: boolean
}) {
  const { actions, pending } = useRoomSession()
  if (reveal.kind === 'revealed' || reveal.kind === 'never') return null
  if (reveal.kind === 'closed' && hint.votesFor === 0) return null

  const locked = reveal.kind === 'locked'
  const voted = reveal.kind === 'open' && reveal.voted
  const disabled = reveal.kind !== 'open' || pending.has('hint')
  const cost = hint.cost > 0 ? ` −${hint.cost}` : ''
  // The one-line banner drops words sighted users can infer; screen
  // readers still hear the full label.
  const extra = (text: string) =>
    compact ? <span className="sr-only">{text}</span> : text
  const label = locked ? (
    <>
      Reveal{extra(' letters')} in {reveal.secondsLeft}s
    </>
  ) : voted ? (
    <>
      Voted{extra(' to reveal')}
      {cost}
    </>
  ) : (
    <>
      Reveal{extra(' letters')}
      {cost}
    </>
  )
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={voted}
      onClick={() => void pending.run('hint', () => actions.voteHint(!voted))}
      className={cx(
        'inline-flex shrink-0 items-center rounded-xl border-2 border-[#181713] font-black transition disabled:cursor-not-allowed',
        compact
          ? 'min-h-10 gap-1 px-1.5 text-[11px]'
          : 'min-h-11 gap-1.5 px-2.5 text-xs',
        voted ? 'bg-[#f8ff80]' : 'bg-white',
        !disabled &&
          'shadow-[2px_2px_0_#181713] active:translate-x-px active:translate-y-px active:shadow-none',
        disabled && 'opacity-60',
      )}
    >
      <span>{label}</span>
      <span className="rounded-md bg-black/10 px-1 font-mono tabular-nums">
        <span className="sr-only">votes </span>
        {hint.votesFor}/{hint.votesNeeded}
      </span>
    </button>
  )
}
