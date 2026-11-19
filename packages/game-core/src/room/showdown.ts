import {
  SHOWDOWN_FIRST_CLEAR_BONUS,
  SHOWDOWN_POINTS_PER_CARD,
} from '../scoring'
import type { TeamId } from '../types'
import { TEAM_IDS } from '../types'
import { emitWordEvents, showdownResultEvents } from './account-effects'
import { clearBots, dropBotCanvas, planBotsForCanvas } from './bots'
import { SHOWDOWN_BOT_CARD_BUDGET_MS } from './constants'
import type { RoomContext } from './context'
import {
  emit,
  patchState,
  requireMatch,
  requireShowdown,
  updateMatch,
  updateShowdown,
  updateShowdownTeam,
  updateStats,
} from './context'
import { endMatch } from './match'
import { pickRotationMember } from './members'
import { chosenOption } from './selectors'
import type {
  DraftOption,
  ShowdownCardResult,
  ShowdownTeamState,
} from './types'

function showdownCanvasId(
  matchNumber: number,
  team: TeamId,
  cardIndex: number,
): string {
  return `m${matchNumber}-sd-${team}-${cardIndex}`
}

/** Each team's chosen words from the normal rounds, in round order. */
function showdownCardsFor(ctx: RoomContext, team: TeamId): DraftOption[] {
  return requireMatch(ctx.state).history.flatMap((round) => {
    const chosen = chosenOption(round.teams[team])
    return chosen === null ? [] : [chosen]
  })
}

function relayDrawerId(
  ctx: RoomContext,
  team: TeamId,
  relayTurn: number,
): string {
  const turns = requireMatch(ctx.state).drawerTurns[team]
  return pickRotationMember(ctx.state, team, turns + relayTurn, ctx.now).id
}

/** Resets the card's canvas, credits the relay drawer, and plans bots. */
function openCard(ctx: RoomContext, team: TeamId): void {
  const teamState = requireShowdown(ctx.state).teams[team]
  const card = teamState.cards[teamState.cardIndex]
  if (card === undefined || teamState.drawerId === null) return
  emit(ctx, { type: 'canvas.reset', canvasId: teamState.canvasId, team })
  updateStats(ctx, teamState.drawerId, (stats) => ({
    ...stats,
    showdownCardsDrawn: stats.showdownCardsDrawn + 1,
  }))
  planBotsForCanvas(ctx, {
    team,
    canvasId: teamState.canvasId,
    drawerId: teamState.drawerId,
    term: card.term,
    aliases: card.aliases,
    budgetMs: SHOWDOWN_BOT_CARD_BUDGET_MS,
    reservedTerms: teamState.cards.map((entry) => entry.term),
  })
}

/** Relay redraw of each team's own words, shuffled independently. */
export function startShowdown(ctx: RoomContext): void {
  const match = requireMatch(ctx.state)
  const settings = ctx.state.settings
  const deadlineAtMs = ctx.now + settings.showdownSeconds * 1000
  const relayTeam = (team: TeamId): ShowdownTeamState => {
    const cards = ctx.rng.shuffle(showdownCardsFor(ctx, team))
    return {
      team,
      cards,
      cardIndex: 0,
      drawerId: cards.length === 0 ? null : relayDrawerId(ctx, team, 0),
      relayTurn: 0,
      canvasId: showdownCanvasId(match.number, team, 0),
      cardStartedAtMs: ctx.now,
      strokeCount: 0,
      firstStrokeAtMs: null,
      guesses: [],
      finishedAtMs: cards.length === 0 ? ctx.now : null,
      results: [],
    }
  }
  const teams = { A: relayTeam('A'), B: relayTeam('B') }
  updateMatch(ctx, (current) => ({
    ...current,
    showdown: {
      startedAtMs: ctx.now,
      deadlineAtMs,
      teams,
      firstClearTeam: null,
      endedAtMs: null,
    },
    guessLimits: {},
  }))
  patchState(ctx, {
    phase: 'showdown',
    phaseStartedAtMs: ctx.now,
    phaseDeadlineAtMs: deadlineAtMs,
  })
  for (const team of TEAM_IDS) openCard(ctx, team)
}

function addShowdownPoints(
  ctx: RoomContext,
  team: TeamId,
  points: number,
): void {
  updateMatch(ctx, (match) => ({
    ...match,
    showdownPoints: {
      ...match.showdownPoints,
      [team]: match.showdownPoints[team] + points,
    },
    scores: { ...match.scores, [team]: match.scores[team] + points },
  }))
}

/**
 * Logs the active card's outcome in the team's `results` (so a late account
 * link can be credited) and reports it to account members. False when the
 * team has no active card.
 */
function finishActiveCard(
  ctx: RoomContext,
  team: TeamId,
  guesserId: string | null,
): boolean {
  const active = requireShowdown(ctx.state).teams[team]
  const card = active.cards[active.cardIndex]
  if (card === undefined || active.drawerId === null) return false
  const result: ShowdownCardResult = {
    cardIndex: active.cardIndex,
    drawerId: active.drawerId,
    guesserId,
    solveMs: guesserId === null ? null : ctx.now - active.cardStartedAtMs,
    atMs: ctx.now,
  }
  updateShowdownTeam(ctx, team, (teamState) => ({
    ...teamState,
    results: [...(teamState.results ?? []), result],
  }))
  const logged = requireShowdown(ctx.state).teams[team]
  emitWordEvents(ctx, showdownResultEvents(ctx.state, logged, result))
  return true
}

/**
 * A correct showdown guess: +10, then the next card and relay drawer on a
 * fresh canvas. Clearing the last card finishes the team (+20 if first).
 */
export function clearShowdownCard(
  ctx: RoomContext,
  team: TeamId,
  guesserId: string,
): void {
  const match = requireMatch(ctx.state)
  if (!finishActiveCard(ctx, team, guesserId)) return
  const teamState = requireShowdown(ctx.state).teams[team]

  updateStats(ctx, guesserId, (stats) => ({
    ...stats,
    showdownCardsGuessed: stats.showdownCardsGuessed + 1,
  }))
  addShowdownPoints(ctx, team, SHOWDOWN_POINTS_PER_CARD)
  dropBotCanvas(ctx, teamState.canvasId)

  const cardIndex = teamState.cardIndex + 1
  const finished = cardIndex >= teamState.cards.length
  const relayTurn = teamState.relayTurn + 1
  const next: ShowdownTeamState = finished
    ? {
        ...teamState,
        cardIndex,
        drawerId: null,
        guesses: [],
        finishedAtMs: ctx.now,
      }
    : {
        ...teamState,
        cardIndex,
        relayTurn,
        drawerId: relayDrawerId(ctx, team, relayTurn),
        canvasId: showdownCanvasId(match.number, team, cardIndex),
        cardStartedAtMs: ctx.now,
        strokeCount: 0,
        firstStrokeAtMs: null,
        guesses: [],
      }
  const firstClear =
    finished && requireShowdown(ctx.state).firstClearTeam === null
  updateShowdown(ctx, (showdown) => ({
    ...showdown,
    teams: { ...showdown.teams, [team]: next },
    firstClearTeam: firstClear ? team : showdown.firstClearTeam,
  }))
  if (firstClear) addShowdownPoints(ctx, team, SHOWDOWN_FIRST_CLEAR_BONUS)

  if (!finished) {
    openCard(ctx, team)
    return
  }
  const showdown = requireShowdown(ctx.state)
  if (TEAM_IDS.every((id) => showdown.teams[id].finishedAtMs !== null)) {
    endShowdown(ctx)
  }
}

/** Deadline or both teams finished: unfinished active cards count as drawn. */
export function endShowdown(ctx: RoomContext): void {
  for (const team of TEAM_IDS) finishActiveCard(ctx, team, null)
  updateShowdown(ctx, (current) => ({ ...current, endedAtMs: ctx.now }))
  clearBots(ctx)
  endMatch(ctx, 'completed', null)
}
