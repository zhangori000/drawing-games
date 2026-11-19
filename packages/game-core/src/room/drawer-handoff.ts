import type { TeamId } from '../types'
import { TEAM_IDS } from '../types'
import { dropBotCanvas, planBotDraftPick, planBotsForCanvas } from './bots'
import { SHOWDOWN_BOT_CARD_BUDGET_MS } from './constants'
import type { RoomContext } from './context'
import { updateShowdownTeam, updateStats, updateTeamRound } from './context'
import { isWithinGrace } from './members'
import { chosenOption } from './selectors'
import type { RoomMember, RoomState } from './types'

/**
 * The teammate after `leaverId` in rotation (join) order who can take over
 * the drawing: still in the room and within the reconnect grace if anyone
 * is, else any remaining teammate. null when nobody else is left.
 */
function nextTeammate(
  state: RoomState,
  team: TeamId,
  leaverId: string,
  now: number,
): RoomMember | null {
  const order = state.members.filter((member) => member.team === team)
  const start = order.findIndex((member) => member.id === leaverId)
  const after = [...order.slice(start + 1), ...order.slice(0, start)].filter(
    (member) => member.left !== true && member.id !== leaverId,
  )
  return after.find((member) => isWithinGrace(member, now)) ?? after[0] ?? null
}

function handOffRound(ctx: RoomContext, team: TeamId, leaverId: string): void {
  const round = ctx.state.match?.round
  if (round === null || round === undefined) return
  const teamRound = round.teams[team]
  if (teamRound.drawerId !== leaverId || teamRound.solution !== null) return
  const next = nextTeammate(ctx.state, team, leaverId, ctx.now)
  if (next === null) return
  updateTeamRound(ctx, team, (current) => ({ ...current, drawerId: next.id }))

  if (ctx.state.phase === 'word-draft') {
    // Same cards, swaps, and deadline: the turn continues with a new drawer.
    if (teamRound.chosenWordId === null) planBotDraftPick(ctx, next.id)
    return
  }
  const word = chosenOption(teamRound)
  if (word === null) return
  // Same word and canvas; bots re-plan around the new drawer.
  dropBotCanvas(ctx, teamRound.canvasId)
  planBotsForCanvas(ctx, {
    team,
    canvasId: teamRound.canvasId,
    drawerId: next.id,
    term: word.term,
    aliases: word.aliases,
    budgetMs: Math.max(0, (round.drawingDeadlineAtMs ?? ctx.now) - ctx.now),
    reservedTerms: TEAM_IDS.flatMap((id) =>
      round.teams[id].options.map((option) => option.term),
    ),
  })
}

function handOffShowdownCard(
  ctx: RoomContext,
  team: TeamId,
  leaverId: string,
): void {
  const teamState = ctx.state.match?.showdown?.teams[team]
  if (teamState === undefined || teamState.drawerId !== leaverId) return
  const card = teamState.cards[teamState.cardIndex]
  if (card === undefined || teamState.finishedAtMs !== null) return
  const next = nextTeammate(ctx.state, team, leaverId, ctx.now)
  if (next === null) return
  updateShowdownTeam(ctx, team, (current) => ({
    ...current,
    drawerId: next.id,
  }))
  updateStats(ctx, next.id, (stats) => ({
    ...stats,
    showdownCardsDrawn: stats.showdownCardsDrawn + 1,
  }))
  dropBotCanvas(ctx, teamState.canvasId)
  planBotsForCanvas(ctx, {
    team,
    canvasId: teamState.canvasId,
    drawerId: next.id,
    term: card.term,
    aliases: card.aliases,
    budgetMs: SHOWDOWN_BOT_CARD_BUDGET_MS,
    reservedTerms: teamState.cards.map((entry) => entry.term),
  })
}

/**
 * A drawer who explicitly leaves mid-turn (not one who merely disconnects)
 * hands the turn to the next teammate in rotation, so their team is never
 * left waiting for the deadline: during the draft the new drawer gets the
 * same cards, remaining swaps, and remaining time; while drawing or on a
 * showdown card they get the same word and canvas for the remaining time.
 * A team that already solved, or has nobody left, is unaffected. Call after
 * the leaver is marked `left`.
 */
export function handOffDrawerTurn(ctx: RoomContext, leaverId: string): void {
  const phase = ctx.state.phase
  for (const team of TEAM_IDS) {
    if (phase === 'word-draft' || phase === 'drawing') {
      handOffRound(ctx, team, leaverId)
    } else if (phase === 'showdown') {
      handOffShowdownCard(ctx, team, leaverId)
    }
  }
}
