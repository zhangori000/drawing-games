import {
  isNormalizedPoint,
  type DrawingAction,
  type NormalizedPoint,
} from '@drawing-games/drawing-model'

import { renderTextStrokes } from './bot-font'
import { scheduleBotItem } from './bots'
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
import type { BotScheduleItem, RoomMember } from './types'

/** Human drawers must have this many strokes before bots answer. */
const MIN_HUMAN_STROKES_FOR_BOT_ANSWER = 3
const BOT_ANSWER_RETRY_MS = 5_000

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

function drawNextStroke(
  ctx: RoomContext,
  bot: RoomMember,
  canvasId: string,
): void {
  const canvas = activeCanvas(ctx.state, bot.team)
  if (
    canvas === null ||
    canvas.canvasId !== canvasId ||
    canvas.drawerId !== bot.id
  ) {
    return
  }
  const drawn = ctx.state.bots.strokesDrawn[canvasId] ?? 0
  const stroke = renderTextStrokes(canvas.term)[drawn]
  patchState(ctx, {
    bots: {
      ...ctx.state.bots,
      strokesDrawn: { ...ctx.state.bots.strokesDrawn, [canvasId]: drawn + 1 },
    },
  })
  if (stroke === undefined) return
  const ops = botStrokeOps(
    `b-${canvasId}-${drawn}`,
    stroke.filter(isNormalizedPoint),
  )
  if (ops.length === 0) return
  applyDrawerOps(ctx, bot.team, canvasId, ops, 'bot', bot.id)
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
    if (canvas.strokeCount < MIN_HUMAN_STROKES_FOR_BOT_ANSWER) {
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
      drawNextStroke(ctx, bot, action.canvasId)
      return
    case 'guess':
      guess(ctx, bot, item, action)
  }
}
