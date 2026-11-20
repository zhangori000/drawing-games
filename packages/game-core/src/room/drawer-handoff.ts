import type { TeamId } from '../types'
import { TEAM_IDS } from '../types'
import { dropBotCanvas, planBotDraftPick, planBotsForCanvas } from './bots'
import { RECONNECT_GRACE_MS, SHOWDOWN_BOT_CARD_BUDGET_MS } from './constants'
import type { RoomContext } from './context'
import { updateShowdownTeam, updateStats, updateTeamRound } from './context'
import { findMember, nextTeammate, teamRoster } from './members'
import { chosenOption } from './selectors'
import type { RoomMember, RoomState } from './types'

function withFormer(
  former: readonly string[] | undefined,
  drawerId: string,
): string[] {
  const list = former ?? []
  return list.includes(drawerId) ? [...list] : [...list, drawerId]
}

/** Gives a team's live draft or drawing turn to `next`. */
function handOffRound(
  ctx: RoomContext,
  team: TeamId,
  fromId: string,
  next: RoomMember,
): void {
  const round = ctx.state.match?.round
  if (round === null || round === undefined) return
  const teamRound = round.teams[team]
  if (teamRound.drawerId !== fromId || teamRound.solution !== null) return
  updateTeamRound(ctx, team, (current) => ({
    ...current,
    drawerId: next.id,
    formerDrawerIds: withFormer(current.formerDrawerIds, fromId),
  }))

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
    difficulty: word.difficulty,
    budgetMs: Math.max(0, (round.drawingDeadlineAtMs ?? ctx.now) - ctx.now),
    reservedTerms: TEAM_IDS.flatMap((id) =>
      round.teams[id].options.map((option) => option.term),
    ),
  })
}

/** Gives a team's active showdown card (same card and canvas) to `next`. */
function handOffShowdownCard(
  ctx: RoomContext,
  team: TeamId,
  fromId: string,
  next: RoomMember,
): void {
  const teamState = ctx.state.match?.showdown?.teams[team]
  if (teamState === undefined || teamState.drawerId !== fromId) return
  const card = teamState.cards[teamState.cardIndex]
  if (card === undefined || teamState.finishedAtMs !== null) return
  updateShowdownTeam(ctx, team, (current) => ({
    ...current,
    drawerId: next.id,
    formerDrawerIds: withFormer(current.formerDrawerIds, fromId),
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
    difficulty: card.difficulty,
    canMiss: false,
    budgetMs: SHOWDOWN_BOT_CARD_BUDGET_MS,
    reservedTerms: teamState.cards.map((entry) => entry.term),
  })
}

function handOff(
  ctx: RoomContext,
  team: TeamId,
  fromId: string,
  next: RoomMember,
): void {
  const phase = ctx.state.phase
  if (phase === 'word-draft' || phase === 'drawing') {
    handOffRound(ctx, team, fromId, next)
  } else if (phase === 'showdown') {
    handOffShowdownCard(ctx, team, fromId, next)
  }
}

/**
 * A drawer who explicitly leaves mid-turn hands the turn to the next
 * teammate in rotation (within grace if anyone is, else anyone left), so
 * their team is never left waiting for the deadline: during the draft the
 * new drawer gets the same cards, remaining swaps, and remaining time;
 * while drawing or on a showdown card they get the same word and canvas
 * for the remaining time. A team that already solved, or has nobody left,
 * is unaffected (see `nextDrawerTakeover` for a later arrival). Call after
 * the leaver is marked `left`.
 */
export function handOffDrawerTurn(ctx: RoomContext, leaverId: string): void {
  const leaver = findMember(ctx.state, leaverId)
  if (leaver === undefined) return
  const next = nextTeammate(ctx.state, leaver.team, leaverId, ctx.now)
  if (next !== null) handOff(ctx, leaver.team, leaverId, next)
}

interface LiveTurn {
  readonly drawerId: string
  readonly formerDrawerIds: readonly string[]
}

/** `team`'s turn while it is still being played, if any. */
function liveTurn(state: RoomState, team: TeamId): LiveTurn | null {
  const match = state.match
  if (match === null) return null
  if (
    (state.phase === 'word-draft' || state.phase === 'drawing') &&
    match.round !== null
  ) {
    const teamRound = match.round.teams[team]
    if (teamRound.solution !== null) return null
    return {
      drawerId: teamRound.drawerId,
      formerDrawerIds: teamRound.formerDrawerIds ?? [],
    }
  }
  if (state.phase === 'showdown' && match.showdown !== null) {
    const teamState = match.showdown.teams[team]
    if (teamState.finishedAtMs !== null || teamState.drawerId === null) {
      return null
    }
    return {
      drawerId: teamState.drawerId,
      formerDrawerIds: teamState.formerDrawerIds ?? [],
    }
  }
  return null
}

export interface DrawerTakeover {
  readonly team: TeamId
  /** When the drawer's reconnect grace runs out (or when they left). */
  readonly atMs: number
  readonly fromId: string
  readonly toId: string
}

function takeoverFor(state: RoomState, team: TeamId): DrawerTakeover | null {
  const turn = liveTurn(state, team)
  if (turn === null) return null
  const drawerId = turn.drawerId
  const drawer = findMember(state, drawerId)
  if (drawer === undefined || drawer.kind !== 'human' || drawer.connected) {
    return null
  }
  const next = nextTeammate(state, team, drawerId, 0, 'connected')
  if (next === null) return null
  // The dropped drawer saw the cards and may not guess them, so a takeover
  // only helps if someone else could still guess (in a pair, or a human
  // with one bot, the drawer is better off finishing when they are back).
  const sittingOut = new Set([...turn.formerDrawerIds, drawerId, next.id])
  const guesserLeft = teamRoster(state, team).some(
    (member) => !sittingOut.has(member.id),
  )
  if (!guesserLeft) return null
  return {
    team,
    // A drawer who left has no grace (they left with nobody to take over,
    // and someone has joined since).
    atMs:
      drawer.left === true
        ? drawer.lastSeenAtMs
        : drawer.lastSeenAtMs + RECONNECT_GRACE_MS,
    fromId: drawerId,
    toId: next.id,
  }
}

/**
 * The earliest pending drawer takeover: a live turn (draft, drawing, or
 * showdown card of a team that has not solved it) whose human drawer is
 * disconnected while a teammate is connected and a third teammate could
 * still guess. It is due when the drawer's reconnect grace runs out; a
 * drawer back by then keeps the turn. Pure, so `nextWakeAtMs` and
 * `runDueWork` agree on it.
 */
export function nextDrawerTakeover(state: RoomState): DrawerTakeover | null {
  let best: DrawerTakeover | null = null
  for (const team of TEAM_IDS) {
    const takeover = takeoverFor(state, team)
    if (takeover !== null && (best === null || takeover.atMs < best.atMs)) {
      best = takeover
    }
  }
  return best
}

/**
 * Runs a due takeover: the first connected teammate after the drawer
 * continues the same turn exactly as after an explicit leave (same cards
 * and remaining swaps, or same word and canvas, and the remaining time).
 * The dropped drawer stays on the team; back, they watch the rest of this
 * turn (they saw its cards) and guess again from the next one.
 */
export function runDrawerTakeover(
  ctx: RoomContext,
  takeover: DrawerTakeover,
): void {
  const next = findMember(ctx.state, takeover.toId)
  if (next === undefined) return
  handOff(ctx, takeover.team, takeover.fromId, next)
}
