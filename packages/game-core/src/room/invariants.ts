import {
  SHOWDOWN_FIRST_CLEAR_BONUS,
  SHOWDOWN_POINTS_PER_CARD,
} from '../scoring'
import type { TeamId } from '../types'
import { TEAM_IDS } from '../types'
import { GUESS_FEED_LIMIT } from './constants'
import { activeMembers, findMember, teamRoster } from './members'
import { MAX_MEMBERS_PER_TEAM, MAX_ROOM_MEMBERS } from './settings'
import { chosenOption } from './selectors'
import type { MatchState, RoomState, RoundState } from './types'
import { ROOM_STATE_VERSION } from './types'
import { roomPool, roundWordDemand } from './words'

export class RoomInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RoomInvariantError'
  }
}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new RoomInvariantError(message)
}

function checkMembers(state: RoomState): void {
  const ids = state.members.map((member) => member.id)
  check(new Set(ids).size === ids.length, 'member ids must be unique')
  const active = activeMembers(state)
  check(active.length <= MAX_ROOM_MEMBERS, 'too many members')
  for (const team of TEAM_IDS) {
    check(
      teamRoster(state, team).length <= MAX_MEMBERS_PER_TEAM,
      `team ${team} is over capacity`,
    )
  }
  for (const member of state.members) {
    if (member.kind === 'bot') {
      check(
        member.connected && member.ready,
        `bot ${member.id} must be connected and ready`,
      )
      check(
        member.accountId === null,
        `bot ${member.id} must not have an account`,
      )
    }
    if (member.left === true) {
      check(state.phase !== 'lobby', `left member ${member.id} still in lobby`)
      check(!member.connected, `left member ${member.id} is connected`)
    }
  }
  const humans = active.filter((member) => member.kind === 'human')
  if (state.hostId === null) {
    check(humans.length === 0, 'a room with humans must have a host')
  } else {
    check(
      humans.some((member) => member.id === state.hostId),
      'host must be an active human member',
    )
  }
}

function expectedDeadline(state: RoomState): number | null {
  const match = state.match
  switch (state.phase) {
    case 'lobby':
    case 'stats':
      return null
    case 'word-draft':
      return match?.round?.draftDeadlineAtMs ?? Number.NaN
    case 'drawing':
      return match?.round?.drawingDeadlineAtMs ?? Number.NaN
    case 'round-results': {
      const endedAt = match?.round?.endedAtMs
      return endedAt === null || endedAt === undefined
        ? Number.NaN
        : endedAt + state.settings.roundResultsSeconds * 1000
    }
    case 'showdown':
      return match?.showdown?.deadlineAtMs ?? Number.NaN
  }
}

function checkRound(
  state: RoomState,
  round: RoundState,
  drafting: boolean,
): void {
  const optionIds = TEAM_IDS.map(
    (team) => new Set(round.teams[team].options.map((option) => option.wordId)),
  )
  const [optionsA, optionsB] = optionIds as [Set<string>, Set<string>]
  const poolSize = roomPool(state.settings).length
  const tinyPool = poolSize < 2 * state.settings.wordChoiceCount
  if (!tinyPool) {
    for (const id of optionsA) {
      check(
        !optionsB.has(id),
        `teams share draft card ${id} in round ${round.number}`,
      )
    }
  }
  for (const team of TEAM_IDS) {
    const teamRound = round.teams[team]
    check(teamRound.team === team, 'team round keyed by its team')
    check(teamRound.options.length > 0, `team ${team} has no draft cards`)
    check(
      optionIds[TEAM_IDS.indexOf(team)]?.size === teamRound.options.length,
      `team ${team} has duplicate cards`,
    )
    // In the lobby the previous match is kept only for numbering, and its
    // former members may already have been pruned.
    if (state.phase !== 'lobby') {
      const drawer = findMember(state, teamRound.drawerId)
      check(drawer?.team === team, `team ${team} drawer must be on the team`)
    }
    if (teamRound.chosenWordId !== null) {
      check(
        chosenOption(teamRound) !== null,
        `team ${team} chose a missing card`,
      )
    }
    if (!drafting) {
      check(
        teamRound.chosenWordId !== null,
        `team ${team} has no word after the draft`,
      )
    }
    check(
      teamRound.replacements.length <= state.settings.replacementsPerDrawer,
      `team ${team} exceeded word swaps`,
    )
    check(teamRound.guesses.length <= GUESS_FEED_LIMIT, 'guess feed over limit')
    if (teamRound.solution !== null) {
      check(teamRound.solution.points >= 0, 'negative round points')
      check(
        teamRound.solution.points === teamRound.solution.breakdown.total,
        'solution points must match its breakdown',
      )
    }
  }
}

function expectedScore(match: MatchState, team: TeamId): number {
  const rounds = match.history.reduce((sum, round) => {
    const points = round.teams[team].solution?.points ?? 0
    return sum + points + (round.winner === team ? round.shutdownBonus : 0)
  }, 0)
  return rounds + match.showdownPoints[team]
}

function checkShowdown(match: MatchState): void {
  const showdown = match.showdown
  if (showdown === null) {
    check(
      match.showdownPoints.A === 0 && match.showdownPoints.B === 0,
      'showdown points without a showdown',
    )
    return
  }
  for (const team of TEAM_IDS) {
    const teamState = showdown.teams[team]
    check(
      teamState.cardIndex <= teamState.cards.length,
      'card index out of range',
    )
    const finished = teamState.cardIndex === teamState.cards.length
    check(
      finished === (teamState.finishedAtMs !== null),
      `showdown team ${team} finish flag mismatch`,
    )
    check(
      finished === (teamState.drawerId === null),
      'finished teams have no drawer',
    )
    const bonus =
      showdown.firstClearTeam === team ? SHOWDOWN_FIRST_CLEAR_BONUS : 0
    check(
      match.showdownPoints[team] ===
        teamState.cardIndex * SHOWDOWN_POINTS_PER_CARD + bonus,
      `showdown points for ${team} must equal cleared cards`,
    )
  }
}

function checkMatch(state: RoomState, match: MatchState): void {
  for (const team of TEAM_IDS) {
    check(
      match.scores[team] === expectedScore(match, team),
      `team ${team} score must equal awarded points`,
    )
  }
  check(
    match.completedRounds === match.history.length,
    'history length mismatch',
  )
  check(match.completedRounds <= state.settings.rounds, 'too many rounds')
  check(
    match.drawerTurns.A === match.completedRounds &&
      match.drawerTurns.B === match.completedRounds,
    'drawer turns advance once per round',
  )
  checkShowdown(match)

  const running = state.phase !== 'lobby' && state.phase !== 'stats'
  check(
    running === (match.endedAtMs === null),
    'match end must match the phase',
  )
  if (running) {
    for (const member of activeMembers(state)) {
      check(member.id in match.stats, `member ${member.id} has no match stats`)
    }
  }
  const liveRound =
    match.round !== null && match.round.number > match.completedRounds
      ? match.round
      : null
  for (const round of match.history) checkRound(state, round, false)
  if (liveRound !== null) {
    checkRound(state, liveRound, state.phase === 'word-draft')
    if (state.phase === 'drawing') {
      check(
        TEAM_IDS.some((team) => liveRound.teams[team].solution === null),
        'both teams solved but drawing continues',
      )
    }
  }
  if (state.phase === 'word-draft' || state.phase === 'drawing') {
    check(liveRound !== null, `${state.phase} needs a live round`)
  }

  const chosen = [...match.history, ...(liveRound === null ? [] : [liveRound])]
    .flatMap((round) => TEAM_IDS.map((team) => round.teams[team].chosenWordId))
    .filter((id): id is string => id !== null)
  // With enough never-drawn words for every card a round can deal, the
  // selector never deals a drawn word, so nothing can repeat.
  const poolHadRoom =
    roomPool(state.settings).length >=
    state.wordMemory.usedWordIds.length + roundWordDemand(state.settings)
  if (poolHadRoom) {
    check(
      new Set(chosen).size === chosen.length,
      'a chosen word repeated within the match',
    )
  }
}

/**
 * Dev/test helper: throws RoomInvariantError when the state has drifted
 * from the rules (phase/deadline consistency, one drawer per team, scores
 * equal awarded points, no repeated words while the pool has room, ...).
 */
export function assertRoomInvariants(state: RoomState): void {
  check(state.version === ROOM_STATE_VERSION, 'unknown state version')
  check(
    Number.isInteger(state.rngState) &&
      state.rngState >= 0 &&
      state.rngState < 2 ** 32,
    'rngState must be uint32',
  )
  check(
    Number.isSafeInteger(state.seq) && state.seq >= 0,
    'seq must be a non-negative integer',
  )
  checkMembers(state)

  const deadline = expectedDeadline(state)
  check(
    state.phaseDeadlineAtMs === deadline,
    `phase ${state.phase} deadline ${String(state.phaseDeadlineAtMs)} != ${String(deadline)}`,
  )
  if (state.phase !== 'lobby')
    check(state.match !== null, `${state.phase} needs a match`)
  if (
    state.phase === 'word-draft' ||
    state.phase === 'drawing' ||
    state.phase === 'round-results'
  ) {
    check(state.match?.round != null, `${state.phase} needs a round`)
  }
  if (state.phase === 'showdown')
    check(state.match?.showdown != null, 'showdown state missing')
  if (state.match !== null) checkMatch(state, state.match)

  const schedule = state.bots.schedule
  for (let index = 1; index < schedule.length; index += 1) {
    check(
      (schedule[index - 1]?.atMs ?? 0) <= (schedule[index]?.atMs ?? 0),
      'bot schedule must be sorted',
    )
  }
  for (const item of schedule) {
    check(
      findMember(state, item.botId)?.kind === 'bot',
      'schedule item for a non-bot',
    )
  }
  if (
    state.phase === 'lobby' ||
    state.phase === 'stats' ||
    state.phase === 'round-results'
  ) {
    check(schedule.length === 0, `no bot work expected during ${state.phase}`)
  }

  const used = state.wordMemory.usedWordIds
  check(
    Object.values(state.wordMemory.offeredAt).every(
      (draft) => draft >= 1 && draft <= state.wordMemory.draftCounter,
    ),
    'offeredAt must reference past drafts',
  )
  check(used.length <= 1000, 'used word list over cap')
}
