'use client'

import type { HintView, WordDifficulty } from '@drawing-games/game-core'

import { useCountdown } from '@/components/ui/countdown'
import { cx } from '@/components/ui/cx'

import { describePattern, revealState } from '../../_lib/clue'
import { useRoomSession } from '../room-session'
import { DifficultyChip } from '../shared/difficulty-chip'

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
 * pattern once shown or revealed — plus the team's reveal vote.
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
}: {
  readonly reveal: ReturnType<typeof revealState>
  readonly hint: HintView
}) {
  const { actions, pending } = useRoomSession()
  if (reveal.kind === 'revealed' || reveal.kind === 'never') return null
  if (reveal.kind === 'closed' && hint.votesFor === 0) return null

  const locked = reveal.kind === 'locked'
  const voted = reveal.kind === 'open' && reveal.voted
  const disabled = reveal.kind !== 'open' || pending.has('hint')
  const cost = hint.cost > 0 ? ` −${hint.cost}` : ''
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={voted}
      onClick={() => void pending.run('hint', () => actions.voteHint(!voted))}
      className={cx(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 border-[#181713] px-2.5 text-xs font-black transition disabled:cursor-not-allowed',
        voted ? 'bg-[#f8ff80]' : 'bg-white',
        !disabled &&
          'shadow-[2px_2px_0_#181713] active:translate-x-px active:translate-y-px active:shadow-none',
        disabled && 'opacity-60',
      )}
    >
      <span>
        {locked
          ? `Reveal letters in ${reveal.secondsLeft}s`
          : voted
            ? `Voted to reveal${cost}`
            : `Reveal letters${cost}`}
      </span>
      <span className="rounded-md bg-black/10 px-1 font-mono tabular-nums">
        <span className="sr-only">votes </span>
        {hint.votesFor}/{hint.votesNeeded}
      </span>
    </button>
  )
}
