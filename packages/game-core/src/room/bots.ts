import { matchGuess } from '@drawing-games/word-bank'

import type { TeamId } from '../types'
import { renderTextStrokes } from './bot-font'
import type { RoomContext } from './context'
import { patchState } from './context'
import { findMember, teamRoster } from './members'
import { roomPool } from './words'
import type { BotScheduleItem } from './types'

/** Bot drawers pick a card this long into the draft. */
const DRAFT_PICK_DELAY_MS = { min: 2_000, max: 5_000 } as const
const STROKE_INTERVAL_MS = { min: 700, max: 1_200 } as const
/** Share of planned strokes after which bot guessers "recognize" the word. */
const RECOGNIZE_STROKE_SHARE = 0.6
const RECOGNIZE_DELAY_MS = { min: 2_000, max: 5_000 } as const
/** With nothing drawn (empty font), bot guessers still answer after this. */
const BLANK_CANVAS_DELAY_MS = { min: 4_000, max: 8_000 } as const
/** With a human drawer, the correct guess lands in this share of the round. */
const HUMAN_DRAWER_WINDOW = { min: 0.35, max: 0.85 } as const
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
  /** Time budget used to place guesses when a human draws. */
  readonly budgetMs: number
  /** Terms bots must never use as wrong guesses (every live card). */
  readonly reservedTerms: readonly string[]
}

/**
 * Plans practice-bot behavior for a fresh canvas starting at `ctx.now`: the
 * bot drawer's strokes, and for every bot guesser 1–3 wrong guesses followed
 * by a correct one. Everything is drawn from the room PRNG.
 */
export function planBotsForCanvas(ctx: RoomContext, plan: CanvasPlan): void {
  const start = ctx.now
  const drawer = findMember(ctx.state, plan.drawerId)
  const guessers = teamRoster(ctx.state, plan.team).filter(
    (member) => member.kind === 'bot' && member.id !== plan.drawerId,
  )
  const drawerIsBot = drawer?.kind === 'bot'

  let recognizedAt = start
  if (drawerIsBot) {
    const strokeCount = renderTextStrokes(plan.term).length
    const strokeTimes: number[] = []
    let at = start
    for (let index = 0; index < strokeCount; index += 1) {
      at += ctx.rng.int(STROKE_INTERVAL_MS.min, STROKE_INTERVAL_MS.max)
      strokeTimes.push(at)
      scheduleBotItem(ctx, {
        atMs: at,
        botId: plan.drawerId,
        action: { type: 'draw.next-stroke', canvasId: plan.canvasId },
      })
    }
    const recognizeIndex = Math.max(
      0,
      Math.ceil(strokeCount * RECOGNIZE_STROKE_SHARE) - 1,
    )
    recognizedAt =
      strokeTimes[recognizeIndex] ??
      start + ctx.rng.int(BLANK_CANVAS_DELAY_MS.min, BLANK_CANVAS_DELAY_MS.max)
  }

  for (const guesser of guessers) {
    const correctAt = drawerIsBot
      ? recognizedAt +
        ctx.rng.int(RECOGNIZE_DELAY_MS.min, RECOGNIZE_DELAY_MS.max)
      : start +
        Math.round(
          plan.budgetMs *
            (HUMAN_DRAWER_WINDOW.min +
              (HUMAN_DRAWER_WINDOW.max - HUMAN_DRAWER_WINDOW.min) *
                ctx.rng.next()),
        )
    const wrongCount = ctx.rng.int(WRONG_GUESSES.min, WRONG_GUESSES.max)
    const earliest = start + FIRST_GUESS_DELAY_MS
    const latest = Math.max(earliest, correctAt - 500)
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
