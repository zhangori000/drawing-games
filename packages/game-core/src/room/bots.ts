import { matchGuess } from '@drawing-games/word-bank'

import type { TeamId, WordDifficulty } from '../types'
import { renderLetterPuzzle } from './bot-font'
import type { RoomContext } from './context'
import { patchState } from './context'
import { findMember, teamRoster } from './members'
import { roomPool } from './words'
import type { BotScheduleItem } from './types'

/** Bot drawers pick a card this long into the draft. */
const DRAFT_PICK_DELAY_MS = { min: 2_000, max: 5_000 } as const
/** A bot drawer lays out its blanks one stroke at a time, this fast. */
const OUTLINE_INTERVAL_MS = { min: 250, max: 450 } as const
/**
 * Letters a bot drawer reveals: at most this share of them, and never all,
 * spread over this window of the time budget. A practice puzzle, not the
 * answer written out.
 */
const MAX_REVEAL_SHARE = 0.6
const REVEAL_WINDOW = { start: 0.15, end: 0.75 } as const
const REVEAL_JITTER_MS = 1_500

/**
 * One timing model for every bot guesser, whoever draws, so both teams of
 * a practice match play by the same clock: the correct guess lands in this
 * share of the time budget, and with `miss` odds it never comes (normal
 * rounds only). Harder words take longer and fail more, which is what the
 * difficulty bonus pays for.
 */
const SOLVE_MODEL: Readonly<
  Record<WordDifficulty, { min: number; max: number; miss: number }>
> = Object.freeze({
  easy: { min: 0.2, max: 0.6, miss: 0.08 },
  medium: { min: 0.3, max: 0.7, miss: 0.12 },
  hard: { min: 0.4, max: 0.85, miss: 0.2 },
})
const WRONG_GUESSES = { min: 1, max: 3 } as const
const FIRST_GUESS_DELAY_MS = 1_500
const WRONG_GUESS_ATTEMPTS = 12

/** Keeps the schedule sorted by time; equal times keep insertion order. */
export function scheduleBotItem(ctx: RoomContext, item: BotScheduleItem): void {
  const schedule = ctx.state.bots.schedule
  let index = schedule.length
  while (
    index > 0 &&
    (schedule[index - 1] as BotScheduleItem).atMs > item.atMs
  ) {
    index -= 1
  }
  patchState(ctx, {
    bots: {
      ...ctx.state.bots,
      schedule: [...schedule.slice(0, index), item, ...schedule.slice(index)],
    },
  })
}

export function takeNextBotItem(ctx: RoomContext): BotScheduleItem | null {
  const [first, ...rest] = ctx.state.bots.schedule
  if (first === undefined) return null
  patchState(ctx, { bots: { ...ctx.state.bots, schedule: rest } })
  return first
}

/** Drops planned actions (and stroke progress) for a finished canvas. */
export function dropBotCanvas(ctx: RoomContext, canvasId: string): void {
  const { schedule, strokesDrawn } = ctx.state.bots
  const remaining = schedule.filter(
    (item) =>
      item.action.type === 'draft.pick' || item.action.canvasId !== canvasId,
  )
  if (remaining.length === schedule.length && !(canvasId in strokesDrawn)) {
    return
  }
  const progress = Object.fromEntries(
    Object.entries(strokesDrawn).filter(([id]) => id !== canvasId),
  )
  patchState(ctx, { bots: { schedule: remaining, strokesDrawn: progress } })
}

export function clearBots(ctx: RoomContext): void {
  const { schedule, strokesDrawn } = ctx.state.bots
  if (schedule.length === 0 && Object.keys(strokesDrawn).length === 0) return
  patchState(ctx, { bots: { schedule: [], strokesDrawn: {} } })
}

export function planBotDraftPick(ctx: RoomContext, drawerId: string): void {
  if (findMember(ctx.state, drawerId)?.kind !== 'bot') return
  scheduleBotItem(ctx, {
    atMs:
      ctx.now + ctx.rng.int(DRAFT_PICK_DELAY_MS.min, DRAFT_PICK_DELAY_MS.max),
    botId: drawerId,
    action: { type: 'draft.pick' },
  })
}

export interface CanvasPlan {
  readonly team: TeamId
  readonly canvasId: string
  readonly drawerId: string
  readonly term: string
  readonly aliases: readonly string[]
  readonly difficulty: WordDifficulty
  /** Time the bots plan around (the remaining round, or a showdown card). */
  readonly budgetMs: number
  /** Terms bots must never use as wrong guesses (every live card). */
  readonly reservedTerms: readonly string[]
  /**
   * Whether a bot guesser may never get it (default true). Off for showdown
   * cards, which have no per-card deadline to end a stuck card.
   */
  readonly canMiss?: boolean
}

/** Schedules a bot drawer's letter puzzle (see `renderLetterPuzzle`). */
function planBotPuzzle(ctx: RoomContext, plan: CanvasPlan): void {
  const start = ctx.now
  const puzzle = renderLetterPuzzle(plan.term)
  const outlineCount = puzzle.marks.length + puzzle.slots.length
  let at = start
  for (let index = 0; index < outlineCount; index += 1) {
    at += ctx.rng.int(OUTLINE_INTERVAL_MS.min, OUTLINE_INTERVAL_MS.max)
    scheduleBotItem(ctx, {
      atMs: at,
      botId: plan.drawerId,
      action: { type: 'draw.outline', canvasId: plan.canvasId, index },
    })
  }
  const letters = puzzle.slots.length
  const reveals = Math.min(letters - 1, Math.floor(letters * MAX_REVEAL_SHARE))
  if (reveals <= 0) return
  const order = ctx.rng.shuffle(
    Array.from({ length: letters }, (_, slot) => slot),
  )
  const outlineDone = at
  for (let step = 0; step < reveals; step += 1) {
    const share =
      REVEAL_WINDOW.start +
      ((REVEAL_WINDOW.end - REVEAL_WINDOW.start) * step) /
        Math.max(1, reveals - 1)
    const atMs = Math.max(
      outlineDone + 1,
      start +
        Math.round(plan.budgetMs * share) +
        ctx.rng.int(-REVEAL_JITTER_MS, REVEAL_JITTER_MS),
    )
    scheduleBotItem(ctx, {
      atMs,
      botId: plan.drawerId,
      action: {
        type: 'draw.letter',
        canvasId: plan.canvasId,
        slot: order[step] as number,
      },
    })
  }
}

/**
 * Plans practice-bot behavior for a fresh canvas starting at `ctx.now`. A
 * bot drawer draws a letter puzzle: a blank per letter, then a few letters
 * revealed over the budget (never the whole word), so a human guesser gets
 * a fair puzzle rather than the answer to read. Every bot guesser follows
 * `SOLVE_MODEL` whoever draws: 1–3 wrong guesses, then the answer at a
 * random share of the budget, or (sometimes) never. A human drawer's ink
 * must also look like a real attempt before the answer lands (bot-runner).
 * Everything is drawn from the room PRNG.
 */
export function planBotsForCanvas(ctx: RoomContext, plan: CanvasPlan): void {
  const start = ctx.now
  const drawer = findMember(ctx.state, plan.drawerId)
  const guessers = teamRoster(ctx.state, plan.team).filter(
    (member) => member.kind === 'bot' && member.id !== plan.drawerId,
  )
  if (drawer?.kind === 'bot') planBotPuzzle(ctx, plan)

  const model = SOLVE_MODEL[plan.difficulty]
  for (const guesser of guessers) {
    const share = model.min + (model.max - model.min) * ctx.rng.next()
    const correctAt = start + Math.round(plan.budgetMs * share)
    const misses = plan.canMiss !== false && ctx.rng.next() < model.miss
    const wrongCount =
      ctx.rng.int(WRONG_GUESSES.min, WRONG_GUESSES.max) + (misses ? 1 : 0)
    const earliest = start + FIRST_GUESS_DELAY_MS
    const latest = Math.max(
      earliest,
      misses ? start + Math.round(plan.budgetMs * 0.95) : correctAt - 500,
    )
    for (let index = 0; index < wrongCount; index += 1) {
      const text = pickWrongGuess(ctx, plan)
      if (text === null) break
      scheduleBotItem(ctx, {
        atMs: ctx.rng.int(earliest, latest),
        botId: guesser.id,
        action: {
          type: 'guess',
          canvasId: plan.canvasId,
          text,
          correct: false,
        },
      })
    }
    if (misses) continue
    scheduleBotItem(ctx, {
      atMs: correctAt,
      botId: guesser.id,
      action: {
        type: 'guess',
        canvasId: plan.canvasId,
        text: plan.term,
        correct: true,
      },
    })
  }
}

/** Another pool word that is clearly wrong (never "close" or "partial"). */
function pickWrongGuess(ctx: RoomContext, plan: CanvasPlan): string | null {
  const pool = roomPool(ctx.state.settings)
  if (pool.length === 0) return null
  const reserved = new Set(plan.reservedTerms.map((term) => term.toLowerCase()))
  const target = { term: plan.term, aliases: plan.aliases, otherWords: pool }
  for (let attempt = 0; attempt < WRONG_GUESS_ATTEMPTS; attempt += 1) {
    const candidate = ctx.rng.pick(pool).term
    if (reserved.has(candidate.toLowerCase())) continue
    if (matchGuess(candidate, target) === 'wrong') return candidate
  }
  return null
}
