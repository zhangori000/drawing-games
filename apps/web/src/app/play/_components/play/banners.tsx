'use client'

import type {
  GuessScoreBreakdown,
  WordDifficulty,
} from '@drawing-games/game-core'
import { useState, type ReactNode } from 'react'

import { cx } from '@/components/ui/cx'

import { breakdownSentence, signedPoints } from '../../_lib/format'
import { DifficultyChip } from '../shared/difficulty-chip'
import { usePlayChrome } from './play-layout'

const BANNER =
  'relative flex min-h-[3.75rem] shrink-0 items-center gap-2 border-b-2 border-[#181713] px-3 py-1.5'

export interface WordBannerProps {
  readonly term: string
  readonly difficulty: WordDifficulty
  /** A host custom word with no difficulty tag (chip says "Custom"). */
  readonly unrated?: boolean
  readonly definition?: string | null
  readonly packName?: string | null
  /** Extra line, e.g. showdown card progress. */
  readonly note?: ReactNode
  /**
   * Show the difficulty solve bonus ("+20 pts"). Off for Showdown cards,
   * which score a flat amount whatever their difficulty.
   */
  readonly showBonus?: boolean
}

/**
 * The drawer's secret word. The definition opens as an overlay so the
 * canvas below never moves.
 */
export function WordBanner({
  term,
  difficulty,
  unrated = false,
  definition,
  packName,
  note,
  showBonus = true,
}: WordBannerProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cx(BANNER, 'bg-[#f8ff80]')}>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-black/55">
          Draw this{packName ? ` · ${packName}` : ''}
        </p>
        <p className="flex min-w-0 items-center gap-2">
          <strong
            data-testid="drawer-word"
            className="truncate text-xl font-black tracking-[-0.02em] sm:text-2xl"
          >
            {term}
          </strong>
          <DifficultyChip
            difficulty={difficulty}
            unrated={unrated}
            showBonus={showBonus}
          />
        </p>
        {note ? (
          <p className="truncate text-xs font-semibold text-black/60">{note}</p>
        ) : null}
      </div>
      {definition ? (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="min-h-11 shrink-0 rounded-xl border-2 border-[#181713] bg-white px-3 text-xs font-black"
          >
            {open ? 'Hide' : 'What’s this?'}
          </button>
          {open ? (
            <p
              role="note"
              className="absolute inset-x-3 top-full z-20 mt-1 rounded-2xl border-2 border-[#181713] bg-white p-3 text-sm leading-6 shadow-[4px_4px_0_#181713]"
            >
              <strong className="font-black">{term}:</strong> {definition}{' '}
              <span className="text-black/50">Only you can see this.</span>
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export interface SolvedBannerProps {
  readonly title: string
  readonly points: number
  readonly breakdown: GuessScoreBreakdown | null
  readonly difficulty: WordDifficulty | null
  /** e.g. a "Watch Moon" toggle. */
  readonly action?: ReactNode
}

/** Replaces the clue/word banner once the team solves, with the points. */
export function SolvedBanner({
  title,
  points,
  breakdown,
  difficulty,
  action,
}: SolvedBannerProps) {
  return (
    <div
      className={cx(BANNER, 'bg-[#1f9d72] text-white')}
      data-testid="solved-banner"
    >
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-[#181713] bg-white text-lg font-black text-[#1f9d72]"
      >
        ✓
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-baseline gap-2">
          <strong className="truncate text-lg font-black">{title}</strong>
          <span className="shrink-0 font-mono text-lg font-black tabular-nums text-[#f8ff80]">
            {signedPoints(points)}
          </span>
        </p>
        {breakdown ? (
          <p className="truncate text-xs font-semibold text-white/85">
            {breakdownSentence(breakdown, difficulty)}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

/** A plain banner line (showdown intro, waiting states). */
export function NoteBanner({
  children,
  tone = 'plain',
}: {
  readonly children: ReactNode
  readonly tone?: 'plain' | 'dark'
}) {
  const { compactBanner } = usePlayChrome()
  return (
    <div
      className={cx(
        BANNER,
        compactBanner && 'min-h-11 py-1',
        tone === 'dark'
          ? 'bg-[#181713] text-white'
          : 'bg-[#fffdf7] text-[#181713]',
      )}
    >
      {children}
    </div>
  )
}

/**
 * A secondary banner line (rules, notes) that steps aside while a keyboard
 * squeezes the screen, so the drawing keeps the room.
 */
export function BannerDetail({
  children,
  className,
}: {
  readonly children: ReactNode
  readonly className?: string
}) {
  const { compactBanner } = usePlayChrome()
  if (compactBanner) return null
  return <p className={className}>{children}</p>
}
