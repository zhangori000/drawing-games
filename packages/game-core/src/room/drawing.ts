import {
  isNormalizedPoint,
  isStrokeId,
  isStrokeStyle,
  type DrawingAction,
} from '@drawing-games/drawing-model'

import { calculateShutdownBounty, updateWinStreak } from '../scoring'
import type { TeamId } from '../types'
import { TEAM_IDS } from '../types'
import { emitWordEvents, roundWordEvents } from './account-effects'
import { clearBots, planBotsForCanvas } from './bots'
import { MAX_OPS_PER_BATCH, MAX_POINTS_PER_APPEND } from './constants'
import type { RoomContext } from './context'
import {
  emit,
  patchState,
  reject,
  requireMatch,
  requireRound,
  updateMatch,
  updateMember,
  updateShowdownTeam,
  updateStats,
  updateTeamRound,
} from './context'
import { findActiveMember, rememberWords } from './members'
import { effectiveWordLengthMode } from './settings'
import {
  chosenOption,
  countVotes,
  majorityNeeded,
  requireChosen,
  teamElectorate,
} from './selectors'
import type { InkTail, RoomCommand, RoundState } from './types'
import { recordChosenWords, roomPool } from './words'

type Command<T extends RoomCommand['type']> = Extract<RoomCommand, { type: T }>

/** Both teams start drawing together once both words are locked. */
export function startDrawing(ctx: RoomContext): void {
  const round = requireRound(ctx.state)
  const settings = ctx.state.settings
  const drawingDeadlineAtMs = ctx.now + settings.drawingSeconds * 1000
  const chosen = TEAM_IDS.map((team) => requireChosen(round.teams[team]))

  updateMatch(ctx, (match) => ({
    ...match,
    round: { ...round, drawingStartedAtMs: ctx.now, drawingDeadlineAtMs },
  }))
  patchState(ctx, {
    phase: 'drawing',
    phaseStartedAtMs: ctx.now,
    phaseDeadlineAtMs: drawingDeadlineAtMs,
  })
  recordChosenWords(ctx, chosen)

  const reservedTerms = TEAM_IDS.flatMap((team) =>
    round.teams[team].options.map((option) => option.term),
  )
  for (const team of TEAM_IDS) {
    const teamRound = round.teams[team]
    const word = requireChosen(teamRound)
    planBotsForCanvas(ctx, {
      team,
      canvasId: teamRound.canvasId,
      drawerId: teamRound.drawerId,
      term: word.term,
      aliases: word.aliases,
      difficulty: word.difficulty,
      budgetMs: settings.drawingSeconds * 1000,
      reservedTerms,
    })
  }
}

/* ------------------------------------------------------------------------ */
/* Drawing operations                                                       */
/* ------------------------------------------------------------------------ */

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Shape sanity check; the drawing-model reducer enforces the semantics. */
function isValidDrawingAction(op: unknown): op is DrawingAction {
  if (typeof op !== 'object' || op === null) return false
  const action = op as { readonly type?: unknown } & Record<string, unknown>
  switch (action.type) {
    case 'stroke.begin':
      return (
        isStrokeId(action.strokeId) &&
        isNormalizedPoint(action.point) &&
        isStrokeStyle(action.style)
      )
    case 'stroke.append':
      return (
        isStrokeId(action.strokeId) &&
        isNonNegativeInteger(action.startPointIndex) &&
        Array.isArray(action.points) &&
        action.points.length >= 1 &&
        action.points.length <= MAX_POINTS_PER_APPEND &&
        action.points.every(isNormalizedPoint)
      )
    case 'stroke.end':
      return (
        isStrokeId(action.strokeId) &&
        isNonNegativeInteger(action.pointCount) &&
        action.pointCount >= 1
      )
    case 'stroke.delete':
      return isStrokeId(action.strokeId)
    case 'drawing.clear':
    case 'drawing.undo':
    case 'drawing.redo':
      return true
    default:
      return false
  }
}

interface InkState {
  readonly inkLength?: number
  readonly inkTail?: InkTail
}

/**
 * Adds a human batch's ink to a canvas: the length of every segment drawn,
 * continuing from the last point of the stroke in progress (`inkTail`), so
 * streamed appends are measured in full. Rounded so state stays tidy.
 */
function addInk(canvas: InkState, ops: readonly DrawingAction[]): InkState {
  let total = canvas.inkLength ?? 0
  let tail = canvas.inkTail
  for (const op of ops) {
    if (op.type === 'stroke.begin') {
      tail = { strokeId: op.strokeId, x: op.point.x, y: op.point.y }
    } else if (op.type === 'stroke.append') {
      for (const point of op.points) {
        if (tail !== undefined && tail.strokeId === op.strokeId) {
          total += Math.hypot(point.x - tail.x, point.y - tail.y)
        }
        tail = { strokeId: op.strokeId, x: point.x, y: point.y }
      }
    }
  }
  return {
    inkLength: Math.round(total * 10_000) / 10_000,
    ...(tail === undefined ? {} : { inkTail: tail }),
  }
}

/**
 * Counts completed strokes, stamps the first stroke, and emits the ops
 * unchanged for the realtime layer to apply and fan out.
 */
export function applyDrawerOps(
  ctx: RoomContext,
  team: TeamId,
  canvasId: string,
  ops: readonly DrawingAction[],
  origin: 'member' | 'bot',
  actorId: string,
): void {
  const ended = ops.filter((op) => op.type === 'stroke.end').length
  const began = ops.some((op) => op.type === 'stroke.begin')
  const bump = <
    T extends InkState & {
      strokeCount: number
      firstStrokeAtMs: number | null
    },
  >(
    canvas: T,
  ): T => ({
    ...canvas,
    strokeCount: canvas.strokeCount + ended,
    ...(origin === 'member' ? addInk(canvas, ops) : {}),
    firstStrokeAtMs: canvas.firstStrokeAtMs ?? (began ? ctx.now : null),
  })
  if (ctx.state.phase === 'showdown') updateShowdownTeam(ctx, team, bump)
  else updateTeamRound(ctx, team, bump)
  emit(ctx, { type: 'canvas.ops', canvasId, team, ops, origin, actorId })
}

export function handleDrawingOps(
  ctx: RoomContext,
  command: Command<'drawing.ops'>,
): void {
  const actor = findActiveMember(ctx.state, command.actorId)
  if (actor === undefined) reject('NOT_ALLOWED', 'You are not in this room.')
  const match = ctx.state.match
  let canvasId: string | null = null
  if (ctx.state.phase === 'drawing' && match?.round) {
    const teamRound = match.round.teams[actor.team]
    if (teamRound.drawerId === actor.id) canvasId = teamRound.canvasId
  } else if (ctx.state.phase === 'showdown' && match?.showdown) {
    const teamState = match.showdown.teams[actor.team]
    if (teamState.drawerId === actor.id && teamState.finishedAtMs === null) {
      canvasId = teamState.canvasId
    }
  } else if (ctx.state.phase === 'word-draft') {
    reject('NOT_ALLOWED', 'Drawing starts once both words are picked.')
  }
  if (canvasId === null) reject('NOT_ALLOWED', 'Only the drawer can draw.')

  const raw: readonly unknown[] = Array.isArray(command.ops) ? command.ops : []
  if (raw.length < 1 || raw.length > MAX_OPS_PER_BATCH) {
    reject('BAD_COMMAND', `Send 1–${MAX_OPS_PER_BATCH} drawing operations.`)
  }
  const ops: DrawingAction[] = []
  for (const op of raw) {
    if (!isValidDrawingAction(op)) {
      reject('BAD_COMMAND', 'That drawing update was malformed.')
    }
    ops.push(op)
  }
  applyDrawerOps(ctx, actor.team, canvasId, ops, 'member', actor.id)
}

/* ------------------------------------------------------------------------ */
/* Length hint vote                                                         */
/* ------------------------------------------------------------------------ */

export function handleHintVote(
  ctx: RoomContext,
  command: Command<'hint.vote'>,
): void {
  const actor = findActiveMember(ctx.state, command.actorId)
  if (actor === undefined || actor.kind !== 'human') {
    reject('NOT_ALLOWED', 'You are not in this room.')
  }
  if (ctx.state.phase !== 'drawing') {
    reject('NOT_ALLOWED', 'Hint votes happen while drawing.')
  }
  if (effectiveWordLengthMode(ctx.state.settings) !== 'hidden-vote') {
    reject('NOT_ALLOWED', 'Length hints are not voted on in this room.')
  }
  const round = requireRound(ctx.state)
  const teamRound = round.teams[actor.team]
  if (teamRound.drawerId === actor.id) {
    reject('NOT_ALLOWED', 'The drawer does not vote on hints.')
  }
  if (teamRound.formerDrawerIds?.includes(actor.id) === true) {
    reject('NOT_ALLOWED', 'You saw this word as the drawer.')
  }
  if (teamRound.solution !== null) {
    reject('NOT_ALLOWED', 'Your team already solved it.')
  }
  if (teamRound.hint.revealed) {
    reject('NOT_ALLOWED', 'The length is already revealed.')
  }
  const unlocksAt =
    (round.drawingStartedAtMs ?? ctx.now) +
    ctx.state.settings.hintUnlockSeconds * 1000
  if (ctx.now < unlocksAt) {
    reject('NOT_ALLOWED', 'The hint vote has not opened yet.')
  }
  if (typeof command.approve !== 'boolean') {
    reject('BAD_COMMAND', 'Vote yes or no.')
  }

  const votes = { ...teamRound.hint.votes, [actor.id]: command.approve }
  const electorate = teamElectorate(
    ctx.state,
    actor.team,
    teamRound.drawerId,
    ctx.now,
    teamRound.formerDrawerIds,
  )
  const revealed =
    countVotes(votes, electorate) >= majorityNeeded(electorate.length)
  updateTeamRound(ctx, actor.team, (current) => ({
    ...current,
    hint: {
      votes,
      revealed,
      revealedAtMs: revealed ? ctx.now : null,
    },
  }))
}

/* ------------------------------------------------------------------------ */
/* Round end                                                                */
/* ------------------------------------------------------------------------ */

function roundPoints(round: RoundState, team: TeamId): number {
  return round.teams[team].solution?.points ?? 0
}

function updateRoundStats(ctx: RoomContext, round: RoundState): void {
  const absent = new Set(round.absentIds ?? [])
  for (const team of TEAM_IDS) {
    const teamRound = round.teams[team]
    // A drawer who was away for the whole drawing did not draw it.
    if (absent.has(teamRound.drawerId)) continue
    const word = chosenOption(teamRound)
    const solution = teamRound.solution
    const solveMs =
      solution !== null && round.drawingStartedAtMs !== null
        ? solution.atMs - round.drawingStartedAtMs
        : 0
    updateStats(ctx, teamRound.drawerId, (stats) => ({
      ...stats,
      roundsDrawn: stats.roundsDrawn + 1,
      drawingsSolved: stats.drawingsSolved + (solution !== null ? 1 : 0),
      drawerSolveMsTotal: stats.drawerSolveMsTotal + solveMs,
      hardWordsSolved:
        stats.hardWordsSolved +
        (solution !== null && word?.difficulty === 'hard' ? 1 : 0),
    }))
  }
}

/** Every human's in-room soft memory gains both words; drawers avoid theirs. */
function updateRoundMemory(ctx: RoomContext, round: RoundState): void {
  const words = TEAM_IDS.flatMap((team) => {
    const chosen = chosenOption(round.teams[team])
    return chosen === null ? [] : [chosen.wordId]
  })
  for (const member of ctx.state.members) {
    if (member.kind !== 'human' || member.left === true) continue
    updateMember(ctx, member.id, (current) => {
      let memory = rememberWords(current.memory, 'soft', words)
      for (const team of TEAM_IDS) {
        const teamRound = round.teams[team]
        const chosen = chosenOption(teamRound)
        if (teamRound.drawerId === member.id && chosen !== null) {
          memory = rememberWords(memory, 'avoid', [chosen.wordId])
        }
      }
      return { ...current, memory }
    })
  }
}

/**
 * Humans who were away for the whole drawing: disconnected (or gone) now,
 * and since before it started.
 */
function absentForDrawing(ctx: RoomContext, round: RoundState): string[] {
  const startedAt = round.drawingStartedAtMs ?? ctx.now
  return ctx.state.members
    .filter(
      (member) =>
        member.kind === 'human' &&
        !member.connected &&
        member.lastSeenAtMs <= startedAt,
    )
    .map((member) => member.id)
}

/**
 * Scores the round (winner, shutdown bounty, streak, lead), advances both
 * drawer turns, updates stats and memory, emits account word events, and
 * opens the results phase.
 */
export function endRound(ctx: RoomContext): void {
  const match = requireMatch(ctx.state)
  const live = requireRound(ctx.state)
  const points = { A: roundPoints(live, 'A'), B: roundPoints(live, 'B') }
  const winner: TeamId | null =
    points.A === points.B ? null : points.A > points.B ? 'A' : 'B'
  const shutdownBonus =
    winner === null
      ? 0
      : calculateShutdownBounty({
          roundWinner: winner,
          scoresBeforeRound: live.scoresBeforeRound,
          activeStreakBeforeRound: live.streakBeforeRound,
        })
  const round: RoundState = {
    ...live,
    endedAtMs: ctx.now,
    winner,
    shutdownBonus,
    absentIds: absentForDrawing(ctx, live),
  }
  const scores = {
    A: match.scores.A + points.A + (winner === 'A' ? shutdownBonus : 0),
    B: match.scores.B + points.B + (winner === 'B' ? shutdownBonus : 0),
  }
  const largestLead = {
    A: Math.max(match.largestLead.A, scores.A - scores.B),
    B: Math.max(match.largestLead.B, scores.B - scores.A),
  }

  updateMatch(ctx, (current) => ({
    ...current,
    round,
    history: [...current.history, round],
    scores,
    largestLead,
    completedRounds: current.completedRounds + 1,
    winStreak: updateWinStreak(current.winStreak, winner),
    drawerTurns: {
      A: current.drawerTurns.A + 1,
      B: current.drawerTurns.B + 1,
    },
    surrender: null,
    guessLimits: {},
  }))
  updateRoundStats(ctx, round)
  updateRoundMemory(ctx, round)
  emitWordEvents(
    ctx,
    roundWordEvents(ctx.state, round, roomPool(ctx.state.settings), ctx.now),
  )
  clearBots(ctx)
  patchState(ctx, {
    phase: 'round-results',
    phaseStartedAtMs: ctx.now,
    phaseDeadlineAtMs: ctx.now + ctx.state.settings.roundResultsSeconds * 1000,
  })
}
