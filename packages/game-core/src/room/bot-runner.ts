import {
  isNormalizedPoint,
  type DrawingAction,
  type NormalizedPoint,
} from '@drawing-games/drawing-model'

import {
  renderLetterPuzzle,
  renderLooseLetter,
  type BotPuzzle,
  type PuzzleLayout,
} from './bot-font'
import { botPatternVisible, botPuzzleLayout, scheduleBotItem } from './bots'
import {
  BOT_STROKE_STYLE,
  GUESS_MIN_INTERVAL_MS,
  MAX_POINTS_PER_APPEND,
} from './constants'
import type { RoomContext } from './context'
import { patchState } from './context'
import { botPickWord } from './draft'
import { applyDrawerOps } from './drawing'
import { applyGuess, checkGuess } from './guess'
import { findActiveMember, findMember } from './members'
import { activeCanvas } from './selectors'
import type { WordDifficulty } from '../types'
import type { BotScheduleItem, RoomMember } from './types'

/**
 * A bot only "recognizes" a human drawing with at least this much ink by
 * the time its answer is due (strokes, and total length in canvas
 * fractions); otherwise it keeps looking. A few slashes are not a
 * lighthouse.
 */
const MIN_HUMAN_INK: Readonly<
  Record<WordDifficulty, { strokes: number; length: number }>
> = Object.freeze({
  easy: { strokes: 2, length: 1.2 },
  medium: { strokes: 4, length: 2.5 },
  hard: { strokes: 6, length: 4 },
})
const BOT_ANSWER_RETRY_MS = 4_000

const PUZZLE_CACHE = new Map<string, BotPuzzle>()
const PUZZLE_CACHE_LIMIT = 64

/** Memoized: every outline/letter item of a canvas asks for the same term. */
function puzzleFor(term: string, layout: PuzzleLayout): BotPuzzle {
  const key = `${layout}:${term}`
  const cached = PUZZLE_CACHE.get(key)
  if (cached !== undefined) return cached
  const puzzle = renderLetterPuzzle(term, layout)
  if (PUZZLE_CACHE.size >= PUZZLE_CACHE_LIMIT) {
    const oldest = PUZZLE_CACHE.keys().next().value
    if (oldest !== undefined) PUZZLE_CACHE.delete(oldest)
  }
  PUZZLE_CACHE.set(key, puzzle)
  return puzzle
}

/** `[begin, append…, end]` for one glyph polyline (appends chunked). */
export function botStrokeOps(
  strokeId: string,
  points: readonly NormalizedPoint[],
): DrawingAction[] {
  const [first, ...rest] = points
  if (first === undefined) return []
  const ops: DrawingAction[] = [
    { type: 'stroke.begin', strokeId, point: first, style: BOT_STROKE_STYLE },
  ]
  for (let index = 0; index < rest.length; index += MAX_POINTS_PER_APPEND) {
    ops.push({
      type: 'stroke.append',
      strokeId,
      startPointIndex: 1 + index,
      points: rest.slice(index, index + MAX_POINTS_PER_APPEND),
    })
  }
  ops.push({ type: 'stroke.end', strokeId, pointCount: points.length })
  return ops
}

/** Draws `strokes` on the bot's active canvas as one batch. */
function drawStrokes(
  ctx: RoomContext,
  bot: RoomMember,
  canvasId: string,
  pick: (puzzle: BotPuzzle) => readonly (readonly NormalizedPoint[])[],
): void {
  const canvas = activeCanvas(ctx.state, bot.team)
  if (
    canvas === null ||
    canvas.canvasId !== canvasId ||
    canvas.drawerId !== bot.id
  ) {
    return
  }
  const strokes = pick(puzzleFor(canvas.term, botPuzzleLayout(ctx.state)))
  const drawn = ctx.state.bots.strokesDrawn[canvasId] ?? 0
  const ops: DrawingAction[] = []
  let next = drawn
  for (const stroke of strokes) {
    const batch = botStrokeOps(
      `b-${canvasId}-${next}`,
      stroke.filter(isNormalizedPoint),
    )
    if (batch.length === 0) continue
    ops.push(...batch)
    next += 1
  }
  if (ops.length === 0) return
  patchState(ctx, {
    bots: {
      ...ctx.state.bots,
      strokesDrawn: { ...ctx.state.bots.strokesDrawn, [canvasId]: next },
    },
  })
  applyDrawerOps(ctx, bot.team, canvasId, ops, 'bot', bot.id)
}

/** Blanks first (and hyphens/apostrophes), then glyphs, in puzzle order. */
function outlineStroke(puzzle: BotPuzzle, index: number) {
  const outline = [...puzzle.marks, ...puzzle.slots.map((slot) => slot.blank)]
  const stroke = outline[index]
  return stroke === undefined ? [] : [stroke]
}

function guess(
  ctx: RoomContext,
  bot: RoomMember,
  item: BotScheduleItem,
  action: Extract<BotScheduleItem['action'], { type: 'guess' }>,
): void {
  const canvas = activeCanvas(ctx.state, bot.team)
  if (canvas === null || canvas.canvasId !== action.canvasId) return
  const retry = (delayMs: number) => {
    const atMs = ctx.now + delayMs
    if (
      ctx.state.phaseDeadlineAtMs !== null &&
      atMs >= ctx.state.phaseDeadlineAtMs
    ) {
      return
    }
    scheduleBotItem(ctx, { ...item, atMs })
  }
  if (
    action.correct &&
    findMember(ctx.state, canvas.drawerId)?.kind === 'human'
  ) {
    const ink = MIN_HUMAN_INK[canvas.difficulty]
    if (canvas.strokeCount < ink.strokes || canvas.inkLength < ink.length) {
      retry(BOT_ANSWER_RETRY_MS)
      return
    }
  }
  const check = checkGuess(ctx.state, bot.id, action.text, ctx.now)
  if (check.ok) applyGuess(ctx, bot.id, check.target)
  else if (check.rateLimited) retry(GUESS_MIN_INTERVAL_MS)
}

/** Executes one due practice-bot action at `ctx.now` (its scheduled time). */
export function runBotItem(ctx: RoomContext, item: BotScheduleItem): void {
  const bot = findActiveMember(ctx.state, item.botId)
  if (bot === undefined || bot.kind !== 'bot') return
  const action = item.action
  switch (action.type) {
    case 'draft.pick':
      botPickWord(ctx, bot.id)
      return
    case 'draw.next-stroke':
      // Retired: bots no longer write the answer out.
      return
    case 'draw.outline':
      // Blanks would give away the letter count the team cannot see.
      if (!botPatternVisible(ctx.state, bot.team)) return
      drawStrokes(ctx, bot, action.canvasId, (puzzle) =>
        outlineStroke(puzzle, action.index),
      )
      return
    case 'draw.letter': {
      const loose =
        action.step !== undefined && !botPatternVisible(ctx.state, bot.team)
      drawStrokes(ctx, bot, action.canvasId, (puzzle) => {
        const slot = puzzle.slots[action.slot]
        if (slot === undefined) return []
        return loose
          ? renderLooseLetter(slot.char, action.step as number)
          : slot.glyph
      })
      return
    }
    case 'guess':
      guess(ctx, bot, item, action)
  }
}
