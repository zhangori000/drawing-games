import {
  countFreshWords,
  letterCount,
  wordPattern,
} from '@drawing-games/word-bank'

import {
  DIFFICULTY_BONUSES,
  SHOWDOWN_FIRST_CLEAR_BONUS,
  SHOWDOWN_POINTS_PER_CARD,
} from '../scoring'
import type { TeamId, TeamScores } from '../types'
import { otherTeam } from '../types'
import { lobbyBlockers } from './lobby'
import {
  activeMembers,
  findActiveMember,
  findMember,
  memberName,
  teamRoster,
} from './members'
import {
  effectiveCategoryHint,
  effectiveWordLengthMode,
  MAX_MEMBERS_PER_TEAM,
  MIN_MEMBERS_PER_TEAM,
  ownWordCluesAllowed,
  TEAM_NAMES,
} from './settings'
import { nextPhaseAfterResults } from './results'
import {
  chosenOption,
  countVotes,
  currentDrawerId,
  majorityNeeded,
  requireChosen,
  roundsWon,
  twoThirdsNeeded,
} from './selectors'
import type {
  DraftOption,
  DraftOptionView,
  FinalRoundView,
  FinalView,
  GuessRecord,
  GuessView,
  HintView,
  LobbyView,
  MatchState,
  MatchSummaryView,
  MemberView,
  MeView,
  MyTeamRoundView,
  OpponentRoundView,
  RoomMember,
  RoomSettingsView,
  RoomState,
  RoomView,
  RoundResultsView,
  RoundResultTeamView,
  RoundState,
  RoundView,
  ShowdownMineView,
  ShowdownOpponentView,
  ShowdownState,
  ShowdownView,
  SurrenderView,
  TeamRoundState,
  TeamView,
} from './types'
import {
  countCustomWords,
  drawnInRoom,
  firstRepeatRound,
  roomPool,
  roomUsedKeys,
  unusedWordCount,
} from './words'
import {
  continueHeldBy,
  currentSurrenderVotes,
  hintElectorate,
  surrenderElectorate,
  surrenderEligible,
} from './votes'

/** Everything a projection needs about who is looking. */
interface Viewer {
  readonly state: RoomState
  /** null for non-members (and members who left). */
  readonly member: RoomMember | null
  readonly now: number
}

const PLAY_PHASES = new Set(['word-draft', 'drawing', 'showdown'])

function seconds(ms: number): number {
  return Math.round(ms / 100) / 10
}

/**
 * The team feed. "So close" and "part right" are private to the guesser and
 * to the drawer (who knows the word anyway and can steer the drawing); other
 * teammates see those guesses as plain wrong ones, so nobody can copy a
 * near miss into a solve.
 */
function guessViews(
  viewer: Viewer,
  guesses: readonly GuessRecord[],
  viewerIsDrawer: boolean,
): GuessView[] {
  return guesses.map((guess) => {
    const mine = viewer.member?.id === guess.memberId
    const nearMiss = guess.verdict === 'close' || guess.verdict === 'partial'
    return {
      id: guess.id,
      memberId: guess.memberId,
      memberName: memberName(viewer.state, guess.memberId),
      text: guess.verdict === 'correct' ? null : guess.text,
      verdict: nearMiss && !mine && !viewerIsDrawer ? 'wrong' : guess.verdict,
      atMs: guess.atMs,
      mine,
    }
  })
}

/* ------------------------------------------------------------------------ */
/* Room-wide parts                                                          */
/* ------------------------------------------------------------------------ */

const NO_CUSTOM_WORDS: readonly string[] = Object.freeze([])

/**
 * Custom words are answers: only the current host (who typed them) gets the
 * list, in every phase. Everyone else gets the count. Rematches reuse the
 * list, so it stays hidden on the final screen too; drawn words are revealed
 * one by one in results like any other word.
 */
function settingsView(viewer: Viewer): RoomSettingsView {
  const { state, member } = viewer
  const settings = state.settings
  const isHost = member !== null && state.hostId === member.id
  return {
    ...settings,
    customWords: isHost ? settings.customWords : NO_CUSTOM_WORDS,
    customWordCount: countCustomWords(settings.customWords),
  }
}

function meView(viewer: Viewer): MeView | null {
  const { member, state } = viewer
  if (member === null) return null
  const drawing = currentDrawerId(state, member.team) === member.id
  return {
    memberId: member.id,
    team: member.team,
    isHost: state.hostId === member.id,
    role: drawing
      ? 'drawer'
      : PLAY_PHASES.has(state.phase)
        ? 'guesser'
        : 'idle',
    accountId: member.accountId,
  }
}

function memberViews(state: RoomState): MemberView[] {
  return activeMembers(state).map((member) => ({
    id: member.id,
    displayName: member.displayName,
    team: member.team,
    kind: member.kind,
    connected: member.connected,
    ready: member.ready,
    isHost: state.hostId === member.id,
    isDrawer: currentDrawerId(state, member.team) === member.id,
    hasAccount: member.accountId !== null,
  }))
}

function teamDrawerId(state: RoomState, team: TeamId): string | null {
  const match = state.match
  if (state.phase === 'round-results' && match?.round) {
    return match.round.teams[team].drawerId
  }
  return currentDrawerId(state, team)
}

function teamView(
  state: RoomState,
  match: MatchState | null,
  team: TeamId,
): TeamView {
  return {
    id: team,
    name: TEAM_NAMES[team],
    score: match?.scores[team] ?? 0,
    roundsWon: match === null ? 0 : roundsWon(match, team),
    memberIds: teamRoster(state, team).map((member) => member.id),
    drawerId: teamDrawerId(state, team),
  }
}

function lobbyView(state: RoomState): LobbyView {
  const pool = roomPool(state.settings)
  const remembered = new Set(state.wordMemory.usedWordIds)
  for (const member of activeMembers(state)) {
    for (const id of member.memory.avoid) remembered.add(id)
    for (const id of member.memory.soft) remembered.add(id)
  }
  const blockers = lobbyBlockers(state)
  const unused = unusedWordCount(pool, state.wordMemory.usedWordIds)
  return {
    canStart: blockers.length === 0,
    blockers,
    poolSize: pool.length,
    // Same id-or-answer-key rule as the draft, so a custom "chair" is not
    // fresh for someone who drew the curated one.
    freshWordCount: countFreshWords(pool, remembered),
    unusedWordCount: unused,
    repeatsFromRound: firstRepeatRound(state.settings, unused),
    minPerTeam: MIN_MEMBERS_PER_TEAM,
    maxPerTeam: MAX_MEMBERS_PER_TEAM,
  }
}

function matchSummaryView(
  state: RoomState,
  match: MatchState,
): MatchSummaryView {
  return {
    number: match.number,
    roundNumber: match.round?.number ?? 0,
    totalRounds: state.settings.rounds,
    completedRounds: match.completedRounds,
    scores: match.scores,
    winStreak: match.winStreak,
  }
}

/* ------------------------------------------------------------------------ */
/* Live round                                                               */
/* ------------------------------------------------------------------------ */

function optionView(
  option: DraftOption,
  usedKeys: ReadonlySet<string>,
): DraftOptionView {
  return {
    wordId: option.wordId,
    term: option.term,
    difficulty: option.difficulty,
    packId: option.packId,
    packName: option.packName,
    definition: option.definition,
    unrated: option.unrated === true,
    bonus: DIFFICULTY_BONUSES[option.difficulty],
    drawnBefore: drawnInRoom(usedKeys, option),
  }
}

function draftOptionViews(
  state: RoomState,
  teamRound: TeamRoundState,
): DraftOptionView[] {
  const usedKeys = roomUsedKeys(
    roomPool(state.settings),
    state.wordMemory.usedWordIds,
  )
  return teamRound.options.map((option) => optionView(option, usedKeys))
}

function hintView(
  viewer: Viewer,
  round: RoundState,
  teamRound: TeamRoundState,
): HintView {
  const { state, member, now } = viewer
  const settings = state.settings
  const mode = effectiveWordLengthMode(settings)
  const voting = mode === 'hidden-vote'
  const unlocksAtMs =
    voting && round.drawingStartedAtMs !== null
      ? round.drawingStartedAtMs + settings.hintUnlockSeconds * 1000
      : null
  const electorate = hintElectorate(state, teamRound, now)
  const isElector =
    member !== null && electorate.some((entry) => entry.id === member.id)
  return {
    mode,
    revealed: mode === 'shown' || teamRound.hint.revealed,
    unlocksAtMs,
    canVote:
      voting &&
      state.phase === 'drawing' &&
      unlocksAtMs !== null &&
      now >= unlocksAtMs &&
      !teamRound.hint.revealed &&
      teamRound.solution === null &&
      isElector,
    myVote: member === null ? null : (teamRound.hint.votes[member.id] ?? null),
    votesFor: countVotes(teamRound.hint.votes, electorate),
    votesNeeded: majorityNeeded(electorate.length),
    cost: voting ? settings.hintCost : 0,
  }
}

function myTeamRoundView(
  viewer: Viewer & { readonly member: RoomMember },
  round: RoundState,
): MyTeamRoundView {
  const { state, member } = viewer
  const settings = state.settings
  const teamRound = round.teams[member.team]
  const amDrawer = teamRound.drawerId === member.id
  const chosen = chosenOption(teamRound)
  const drawing = state.phase === 'drawing'
  // While opponents see the draft cards, guessers get nothing that tells
  // the cards apart (see `ownWordCluesAllowed`).
  const clues = ownWordCluesAllowed(settings)
  const lengthVisible =
    !amDrawer &&
    drawing &&
    chosen !== null &&
    (effectiveWordLengthMode(settings) === 'shown' || teamRound.hint.revealed)
  const solution = teamRound.solution
  return {
    team: member.team,
    drawerId: teamRound.drawerId,
    drawerName: memberName(state, teamRound.drawerId),
    amDrawer,
    options:
      amDrawer && state.phase === 'word-draft'
        ? draftOptionViews(state, teamRound)
        : null,
    replacementsLeft: amDrawer
      ? Math.max(
          0,
          settings.replacementsPerDrawer - teamRound.replacements.length,
        )
      : null,
    chosen: chosen !== null,
    word:
      amDrawer && chosen !== null
        ? {
            wordId: chosen.wordId,
            term: chosen.term,
            difficulty: chosen.difficulty,
            definition: chosen.definition,
            unrated: chosen.unrated === true,
            packName: chosen.packName,
            autoPicked: teamRound.chosenBy === 'auto',
          }
        : null,
    difficulty:
      chosen !== null && (amDrawer || clues) ? chosen.difficulty : null,
    category:
      !amDrawer && effectiveCategoryHint(settings) && chosen !== null
        ? chosen.packName
        : null,
    pattern: lengthVisible ? wordPattern(chosen.term) : null,
    letterCount: lengthVisible ? letterCount(chosen.term) : null,
    canvasId: teamRound.canvasId,
    guesses: guessViews(viewer, teamRound.guesses, amDrawer),
    solved: solution !== null,
    solution:
      solution === null
        ? null
        : {
            guesserId: solution.guesserId,
            guesserName: memberName(state, solution.guesserId),
            points: solution.points,
            atMs: solution.atMs,
            breakdown: solution.breakdown,
          },
    hint: hintView(viewer, round, teamRound),
    canGuess:
      drawing &&
      !amDrawer &&
      solution === null &&
      teamRound.formerDrawerIds?.includes(member.id) !== true,
    canDraw: drawing && amDrawer,
  }
}

function opponentRoundView(
  viewer: Viewer,
  round: RoundState,
  team: TeamId,
): OpponentRoundView {
  const { state, member } = viewer
  const teamRound = round.teams[team]
  const visibility = state.settings.opponentDraftVisibility
  const seesDraft = member !== null && state.phase === 'word-draft'
  // Someone who joins once the cards are dealt (say, a second tab on the
  // other team) never gets this draft's cards.
  const seesCards =
    seesDraft &&
    visibility === 'options-and-actions' &&
    member.joinedAtMs <= round.startedAtMs
  const ownSolved =
    member !== null &&
    state.phase === 'drawing' &&
    round.teams[member.team].solution !== null
  return {
    team,
    drawerId: teamRound.drawerId,
    drawerName: memberName(state, teamRound.drawerId),
    options: seesCards
      ? teamRound.options.map((option) => ({
          term: option.term,
          difficulty: option.difficulty,
        }))
      : null,
    actions:
      seesDraft && visibility !== 'hidden'
        ? teamRound.replacements.map((entry) => ({ reason: entry.reason }))
        : null,
    chosen: teamRound.chosenWordId !== null,
    solved: teamRound.solution !== null,
    guessCount: teamRound.guesses.length,
    canvasId: teamRound.canvasId,
    canvasAccess: ownSolved ? 'full' : 'preview',
  }
}

function roundView(viewer: Viewer, round: RoundState): RoundView {
  const { member } = viewer
  return {
    number: round.number,
    draftDeadlineAtMs: round.draftDeadlineAtMs,
    drawingStartedAtMs: round.drawingStartedAtMs,
    drawingDeadlineAtMs: round.drawingDeadlineAtMs,
    mine:
      member === null ? null : myTeamRoundView({ ...viewer, member }, round),
    opponent: opponentRoundView(
      viewer,
      round,
      member === null ? 'B' : otherTeam(member.team),
    ),
  }
}

/* ------------------------------------------------------------------------ */
/* Results, showdown, final                                                 */
/* ------------------------------------------------------------------------ */

function resultTeamView(
  state: RoomState,
  round: RoundState,
  team: TeamId,
): RoundResultTeamView {
  const teamRound = round.teams[team]
  const word = requireChosen(teamRound)
  const solution = teamRound.solution
  return {
    team,
    drawerId: teamRound.drawerId,
    drawerName: memberName(state, teamRound.drawerId),
    wordId: word.wordId,
    term: word.term,
    difficulty: word.difficulty,
    unrated: word.unrated === true,
    packName: word.packName,
    solved: solution !== null,
    solverId: solution?.guesserId ?? null,
    solverName:
      solution === null ? null : memberName(state, solution.guesserId),
    solveSeconds:
      solution === null || round.drawingStartedAtMs === null
        ? null
        : seconds(solution.atMs - round.drawingStartedAtMs),
    points: solution?.points ?? 0,
    breakdown: solution?.breakdown ?? null,
    hintUsed: teamRound.hint.revealed,
    canvasId: teamRound.canvasId,
  }
}

function resultsView(
  viewer: Viewer,
  match: MatchState,
  round: RoundState,
): RoundResultsView {
  const { state } = viewer
  const heldBy = continueHeldBy(state, viewer.now)
  return {
    roundNumber: round.number,
    teams: {
      A: resultTeamView(state, round, 'A'),
      B: resultTeamView(state, round, 'B'),
    },
    winner: round.winner,
    shutdownBonus: round.shutdownBonus,
    scores: match.scores,
    nextPhase: nextPhaseAfterResults(state),
    canContinue:
      heldBy === null &&
      viewer.member !== null &&
      state.hostId === viewer.member.id,
    continueHeldBy: heldBy,
  }
}

function showdownMineView(
  viewer: Viewer,
  showdown: ShowdownState,
  team: TeamId,
): ShowdownMineView {
  const { state, member } = viewer
  const teamState = showdown.teams[team]
  const finished = teamState.finishedAtMs !== null
  const amDrawer = member !== null && teamState.drawerId === member.id
  const card = teamState.cards[teamState.cardIndex]
  return {
    team,
    cardIndex: teamState.cardIndex,
    cardCount: teamState.cards.length,
    cleared: teamState.cardIndex,
    drawerId: teamState.drawerId,
    drawerName:
      teamState.drawerId === null
        ? null
        : memberName(state, teamState.drawerId),
    amDrawer,
    word:
      amDrawer && !finished && card !== undefined
        ? {
            term: card.term,
            difficulty: card.difficulty,
            unrated: card.unrated === true,
          }
        : null,
    canvasId: teamState.canvasId,
    guesses: guessViews(viewer, teamState.guesses, amDrawer),
    finished,
    canGuess:
      !finished &&
      !amDrawer &&
      !(member !== null && teamState.formerDrawerIds?.includes(member.id)),
    canDraw: amDrawer && !finished,
  }
}

function showdownOpponentView(
  viewer: Viewer,
  showdown: ShowdownState,
  team: TeamId,
): ShowdownOpponentView {
  const { state, member } = viewer
  const teamState = showdown.teams[team]
  const ownFinished =
    member !== null && showdown.teams[member.team].finishedAtMs !== null
  return {
    team,
    cardCount: teamState.cards.length,
    cleared: teamState.cardIndex,
    drawerName:
      teamState.drawerId === null
        ? null
        : memberName(state, teamState.drawerId),
    canvasId: teamState.canvasId,
    canvasAccess: ownFinished ? 'full' : 'preview',
    finished: teamState.finishedAtMs !== null,
  }
}

function showdownView(viewer: Viewer, showdown: ShowdownState): ShowdownView {
  const { member } = viewer
  return {
    deadlineAtMs: showdown.deadlineAtMs,
    mine:
      member === null ? null : showdownMineView(viewer, showdown, member.team),
    opponent: showdownOpponentView(
      viewer,
      showdown,
      member === null ? 'B' : otherTeam(member.team),
    ),
    firstClearTeam: showdown.firstClearTeam,
    pointsPerCard: SHOWDOWN_POINTS_PER_CARD,
    finishBonus: SHOWDOWN_FIRST_CLEAR_BONUS,
  }
}

function finalRoundView(state: RoomState, round: RoundState): FinalRoundView {
  const team = (id: TeamId) => {
    const result = resultTeamView(state, round, id)
    return {
      wordId: result.wordId,
      term: result.term,
      difficulty: result.difficulty,
      drawerName: result.drawerName,
      solved: result.solved,
      solverName: result.solverName,
      solveSeconds: result.solveSeconds,
      points: result.points,
      canvasId: result.canvasId,
    }
  }
  return {
    number: round.number,
    winner: round.winner,
    teams: { A: team('A'), B: team('B') },
  }
}

function byTeam(value: (team: TeamId) => number): TeamScores {
  return { A: value('A'), B: value('B') }
}

/** Every participant, in join order; left members keep their names. */
function finalMembers(
  state: RoomState,
  match: MatchState,
): FinalView['members'] {
  const order = new Map(
    state.members.map((member, index) => [member.id, index]),
  )
  const rank = (id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER
  return Object.entries(match.stats)
    .sort(([left], [right]) => rank(left) - rank(right))
    .map(([memberId, stats]) => {
      const member = findMember(state, memberId)
      return {
        memberId,
        displayName: memberName(state, memberId),
        team: member?.team ?? 'A',
        kind: member?.kind ?? 'human',
        stats,
      }
    })
}

function finalView(viewer: Viewer, match: MatchState): FinalView {
  const { state } = viewer
  const showdown = match.showdown
  return {
    winner: match.winner,
    endedReason: match.endedReason ?? 'completed',
    scores: match.scores,
    roundsWon: byTeam((team) => roundsWon(match, team)),
    largestLead: match.largestLead,
    showdown:
      showdown === null
        ? null
        : {
            cleared: byTeam((team) => showdown.teams[team].cardIndex),
            cardCounts: byTeam((team) => showdown.teams[team].cards.length),
            firstClearTeam: showdown.firstClearTeam,
            points: match.showdownPoints,
          },
    rounds: match.history.map((round) => finalRoundView(state, round)),
    members: finalMembers(state, match),
    canRematch: viewer.member !== null && state.hostId === viewer.member.id,
  }
}

function surrenderView(
  viewer: Viewer & { readonly member: RoomMember },
): SurrenderView {
  const { state, member, now } = viewer
  const team = member.team
  const eligible = surrenderEligible(state, team)
  const electorate = surrenderElectorate(state, team, now)
  const votes = currentSurrenderVotes(state, team)
  return {
    team,
    eligible,
    votesFor: countVotes(votes, electorate),
    votesNeeded: twoThirdsNeeded(electorate.length),
    myVote: votes[member.id] ?? null,
    canVote: eligible && electorate.some((entry) => entry.id === member.id),
  }
}

/** Audience-safe projection for one viewer (null or left member → non-member). */
export function projectView(
  state: RoomState,
  viewerId: string | null,
  nowMs: number,
): RoomView {
  const member =
    viewerId === null ? undefined : findActiveMember(state, viewerId)
  const viewer: Viewer = { state, member: member ?? null, now: nowMs }
  const match = state.phase === 'lobby' ? null : state.match
  const round = match?.round ?? null
  const phase = state.phase
  return {
    roomCode: state.roomCode,
    seq: state.seq,
    phase,
    phaseStartedAtMs: state.phaseStartedAtMs,
    phaseDeadlineAtMs: state.phaseDeadlineAtMs,
    hostId: state.hostId,
    me: meView(viewer),
    settings: settingsView(viewer),
    members: memberViews(state),
    teams: { A: teamView(state, match, 'A'), B: teamView(state, match, 'B') },
    lobby: phase === 'lobby' ? lobbyView(state) : null,
    match: match === null ? null : matchSummaryView(state, match),
    round:
      (phase === 'word-draft' || phase === 'drawing') && round !== null
        ? roundView(viewer, round)
        : null,
    results:
      phase === 'round-results' && match !== null && round !== null
        ? resultsView(viewer, match, round)
        : null,
    showdown:
      phase === 'showdown' && match?.showdown
        ? showdownView(viewer, match.showdown)
        : null,
    final:
      phase === 'stats' && match !== null ? finalView(viewer, match) : null,
    surrender:
      phase === 'round-results' && match !== null && viewer.member !== null
        ? surrenderView({ ...viewer, member: viewer.member })
        : null,
  }
}
