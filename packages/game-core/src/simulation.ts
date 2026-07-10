import {
  calculateGuessScore,
  calculateShutdownBounty,
  updateWinStreak,
} from './scoring'
import { DEFAULT_GAME_SETTINGS, type GameSettings } from './settings'
import { getDrawersForRound } from './state-machine'
import {
  projectPublicRoomView,
  type AuthoritativeRoundViewSource,
  type AuthoritativeTeamDraft,
  type AuthoritativeWordReplacementAction,
  type AuthoritativeWordOption,
  type RoomPlayer,
} from './public-view'
import type {
  GamePhaseName,
  PlayerId,
  TeamId,
  TeamRosters,
  TeamScores,
  WinStreak,
  WordDifficulty,
  WordReplacementReason,
} from './types'
import { WORD_REPLACEMENT_REASONS } from './types'

export interface SimulationWord {
  readonly id: string
  readonly word: string
  readonly difficulty: WordDifficulty
}

export const SIMULATION_WORD_BANK: readonly SimulationWord[] = Object.freeze([
  { id: 'cat', word: 'cat', difficulty: 'easy' },
  { id: 'sun', word: 'sun', difficulty: 'easy' },
  { id: 'pizza', word: 'pizza', difficulty: 'easy' },
  { id: 'bicycle', word: 'bicycle', difficulty: 'easy' },
  { id: 'volcano', word: 'volcano', difficulty: 'medium' },
  { id: 'telescope', word: 'telescope', difficulty: 'medium' },
  { id: 'lighthouse', word: 'lighthouse', difficulty: 'medium' },
  { id: 'waterfall', word: 'waterfall', difficulty: 'medium' },
  { id: 'chameleon', word: 'chameleon', difficulty: 'medium' },
  { id: 'parachute', word: 'parachute', difficulty: 'medium' },
  { id: 'photosynthesis', word: 'photosynthesis', difficulty: 'hard' },
  { id: 'constellation', word: 'constellation', difficulty: 'hard' },
  { id: 'ventriloquist', word: 'ventriloquist', difficulty: 'hard' },
  { id: 'metamorphosis', word: 'metamorphosis', difficulty: 'hard' },
  { id: 'archaeologist', word: 'archaeologist', difficulty: 'hard' },
  { id: 'kaleidoscope', word: 'kaleidoscope', difficulty: 'hard' },
])

export interface SimulationSolution {
  readonly guesserId: PlayerId
  readonly receivedAtMs: number
  readonly points: number
}

export interface SimulationTeamDraft extends AuthoritativeTeamDraft {
  readonly replacementActions: readonly AuthoritativeWordReplacementAction[]
}

export interface SimulationRoundState extends Omit<
  AuthoritativeRoundViewSource,
  'drafts'
> {
  readonly drafts: Readonly<Record<TeamId, SimulationTeamDraft>>
  readonly startedAtMs: number
  readonly drawingStartedAtMs: number | null
  readonly scoresBeforeRound: TeamScores
  readonly streakBeforeRound: WinStreak | null
  readonly solutions: Readonly<Record<TeamId, SimulationSolution | null>>
  readonly roundWinner: TeamId | null
  readonly shutdownBonus: number
}

export interface SimulationHistoryEntry {
  readonly seq: number
  readonly serverTimeMs: number
  readonly commandType: SimulationCommand['type']
}

export interface SimulationRoomState {
  readonly roomCode: string
  readonly roomSeq: number
  readonly phase: GamePhaseName
  readonly scores: TeamScores
  readonly players: readonly RoomPlayer[]
  readonly rosters: TeamRosters
  readonly opponentDraftVisibility: GameSettings['opponentDraftVisibility']
  readonly round: SimulationRoundState | null
  readonly completedRounds: number
  readonly winStreak: WinStreak | null
  readonly settings: GameSettings
  readonly seed: number
  readonly rngState: number
  readonly history: readonly SimulationHistoryEntry[]
}

interface SimulationCommandBase {
  readonly seq: number
  readonly serverTimeMs: number
}

export type SimulationCommand =
  | (SimulationCommandBase & { readonly type: 'round.start' })
  | (SimulationCommandBase & {
      readonly type: 'word.seen'
      readonly team: TeamId
      readonly actorId: PlayerId
      readonly optionIndex: number
    })
  | (SimulationCommandBase & {
      readonly type: 'word.replace'
      readonly team: TeamId
      readonly actorId: PlayerId
      readonly optionIndex: number
      readonly reason: WordReplacementReason
    })
  | (SimulationCommandBase & {
      readonly type: 'word.select'
      readonly team: TeamId
      readonly actorId: PlayerId
      readonly optionIndex: number
    })
  | (SimulationCommandBase & { readonly type: 'drawing.start' })
  | (SimulationCommandBase & {
      readonly type: 'guess.correct'
      readonly team: TeamId
      readonly actorId: PlayerId
    })
  | (SimulationCommandBase & { readonly type: 'round.finish' })

export interface CreateFakeRoomOptions {
  readonly seed: number
  readonly roomCode?: string
  readonly teamSizes?: Readonly<Record<TeamId, number>>
  readonly settings?: GameSettings
}

export interface RunSeededRoundsOptions extends CreateFakeRoomOptions {
  readonly rounds?: number
  readonly startAtMs?: number
}

export class SimulationRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SimulationRuleError'
  }
}

export class SimulationInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SimulationInvariantError'
  }
}

/** Creates a headless room with at least one drawer and one guesser per team. */
export function createFakeRoom(
  options: CreateFakeRoomOptions,
): SimulationRoomState {
  const teamSizes = options.teamSizes ?? { A: 3, B: 3 }
  const settings = options.settings ?? DEFAULT_GAME_SETTINGS

  validateRoomCode(options.roomCode ?? 'SIM01')
  validateSeed(options.seed)
  validateTeamSize(teamSizes.A, 'A')
  validateTeamSize(teamSizes.B, 'B')
  validateSettings(settings)

  const players: RoomPlayer[] = []
  const rosters: Record<TeamId, PlayerId[]> = { A: [], B: [] }

  for (const team of ['A', 'B'] as const) {
    for (let index = 1; index <= teamSizes[team]; index += 1) {
      const id = `${team.toLowerCase()}${index}`
      rosters[team].push(id)
      players.push({ id, displayName: `Team ${team} Player ${index}`, team })
    }
  }

  const room: SimulationRoomState = {
    roomCode: options.roomCode ?? 'SIM01',
    roomSeq: 0,
    phase: 'ready',
    scores: { A: 0, B: 0 },
    players,
    rosters,
    opponentDraftVisibility: settings.opponentDraftVisibility,
    round: null,
    completedRounds: 0,
    winStreak: null,
    settings,
    seed: normalizeSeed(options.seed),
    rngState: normalizeSeed(options.seed),
    history: [],
  }

  assertSimulationInvariants(room)
  return room
}

/** Applies one authoritative command without clocks, randomness, or I/O globals. */
export function applySimulationCommand(
  state: SimulationRoomState,
  command: SimulationCommand,
): SimulationRoomState {
  validateCommandEnvelope(state, command)

  const transitioned = (() => {
    switch (command.type) {
      case 'round.start':
        return startRound(state, command.serverTimeMs)
      case 'word.seen':
        return markWordSeen(state, command)
      case 'word.replace':
        return replaceWord(state, command)
      case 'word.select':
        return selectWord(state, command)
      case 'drawing.start':
        return startDrawing(state, command.serverTimeMs)
      case 'guess.correct':
        return recordCorrectGuess(state, command)
      case 'round.finish':
        return finishRound(state, command.serverTimeMs)
    }
  })()

  const next: SimulationRoomState = {
    ...transitioned,
    roomSeq: command.seq,
    history: [
      ...state.history,
      {
        seq: command.seq,
        serverTimeMs: command.serverTimeMs,
        commandType: command.type,
      },
    ],
  }

  assertSimulationInvariants(next)
  return next
}

/** Runs repeatable normal rounds; the same inputs always produce deep equality. */
export function runSeededRounds(
  options: RunSeededRoundsOptions,
): SimulationRoomState {
  let state = createFakeRoom(options)
  const rounds = options.rounds ?? state.settings.rounds

  if (
    !Number.isInteger(rounds) ||
    rounds <= 0 ||
    rounds > state.settings.rounds
  ) {
    throw new SimulationRuleError(
      'rounds must be a positive integer within the configured round count',
    )
  }

  let now = options.startAtMs ?? 1_000_000
  assertSafeTimestamp(now, 'startAtMs')

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    state = applySimulationCommand(state, {
      type: 'round.start',
      seq: state.roomSeq + 1,
      serverTimeMs: now,
    })
    const round = requireRound(state)

    for (const team of ['A', 'B'] as const) {
      const decision = mix32(
        state.seed + round.number * 31 + team.charCodeAt(0),
      )

      if (state.settings.seenRerollsPerDrawer > 0 && decision % 3 === 0) {
        now += 1
        state = applySimulationCommand(state, {
          type: 'word.replace',
          seq: state.roomSeq + 1,
          serverTimeMs: now,
          team,
          actorId: requireRound(state).drawers[team],
          optionIndex: decision % state.settings.wordChoiceCount,
          reason: decision % 2 === 0 ? 'seen-before' : 'unknown-definition',
        })
      }

      now += 1
      state = applySimulationCommand(state, {
        type: 'word.select',
        seq: state.roomSeq + 1,
        serverTimeMs: now,
        team,
        actorId: requireRound(state).drawers[team],
        optionIndex:
          mix32(decision + state.rngState) % state.settings.wordChoiceCount,
      })
    }

    now += 1
    state = applySimulationCommand(state, {
      type: 'drawing.start',
      seq: state.roomSeq + 1,
      serverTimeMs: now,
    })

    const drawingRound = requireRound(state)
    const solveCommands = (['A', 'B'] as const)
      .filter(
        (team) =>
          mix32(state.seed + round.number * 101 + team.charCodeAt(0)) % 5 !== 0,
      )
      .map((team) => {
        const durationMs = state.settings.drawingSeconds * 1_000
        const offset =
          1 +
          (mix32(state.seed + round.number * 211 + team.charCodeAt(0)) %
            durationMs)
        return {
          team,
          atMs: now + offset,
          actorId: firstGuesser(state, team),
        }
      })
      .sort(
        (left, right) =>
          left.atMs - right.atMs || left.team.localeCompare(right.team),
      )

    for (const solve of solveCommands) {
      now = solve.atMs
      state = applySimulationCommand(state, {
        type: 'guess.correct',
        seq: state.roomSeq + 1,
        serverTimeMs: now,
        team: solve.team,
        actorId: solve.actorId,
      })
    }

    const allSolved =
      requireRound(state).solved.A && requireRound(state).solved.B
    now = allSolved ? now : (drawingRound.drawingDeadlineAtMs as number)
    state = applySimulationCommand(state, {
      type: 'round.finish',
      seq: state.roomSeq + 1,
      serverTimeMs: now,
    })

    now += state.settings.roundResultsSeconds * 1_000
  }

  return state
}

/** Throws with a focused message as soon as authoritative state drifts. */
export function assertSimulationInvariants(state: SimulationRoomState): void {
  invariant(
    Number.isSafeInteger(state.roomSeq) && state.roomSeq >= 0,
    'roomSeq must be a non-negative safe integer',
  )
  invariant(
    Number.isInteger(state.rngState) &&
      state.rngState >= 0 &&
      state.rngState <= 0xffff_ffff,
    'rngState must be uint32',
  )
  invariant(
    state.history.length === state.roomSeq,
    'history length must equal roomSeq',
  )
  invariant(
    state.completedRounds >= 0 &&
      state.completedRounds <= state.settings.rounds,
    'completedRounds is outside settings',
  )

  const playerIds = state.players.map((player) => player.id)
  invariant(
    new Set(playerIds).size === playerIds.length,
    'player ids must be unique',
  )

  for (const team of ['A', 'B'] as const) {
    const expectedRoster = state.players
      .filter((player) => player.team === team)
      .map((player) => player.id)
    invariant(
      expectedRoster.length >= 2,
      `Team ${team} needs a drawer and guesser`,
    )
    invariant(
      arraysEqual(expectedRoster, state.rosters[team]),
      `Team ${team} roster does not match players`,
    )
    invariant(
      Number.isSafeInteger(state.scores[team]) && state.scores[team] >= 0,
      `Team ${team} score is invalid`,
    )
  }

  state.history.forEach((entry, index) => {
    invariant(entry.seq === index + 1, 'history sequences must be contiguous')
    assertSafeTimestamp(entry.serverTimeMs, 'history.serverTimeMs')
    if (index > 0) {
      invariant(
        entry.serverTimeMs >=
          (state.history[index - 1] as SimulationHistoryEntry).serverTimeMs,
        'history timestamps must be monotonic',
      )
    }
  })

  if (state.round === null) {
    invariant(
      state.phase === 'ready',
      'only a ready simulation may omit round state',
    )
    invariant(
      state.completedRounds === 0,
      'completed rounds require round state',
    )
    return
  }

  const round = state.round
  const expectedRoundNumber =
    state.phase === 'round-results'
      ? state.completedRounds
      : state.completedRounds + 1
  invariant(
    round.number === expectedRoundNumber,
    'round number is inconsistent with completedRounds',
  )

  const expectedDrawers = getDrawersForRound(state.rosters, round.number)
  invariant(
    round.drawers.A === expectedDrawers.A &&
      round.drawers.B === expectedDrawers.B,
    'drawer rotation is not round-robin',
  )

  for (const team of ['A', 'B'] as const) {
    const draft = round.drafts[team]
    invariant(
      draft.options.length === state.settings.wordChoiceCount,
      `Team ${team} has the wrong option count`,
    )
    invariant(
      new Set(draft.options.map((option) => option.id)).size ===
        draft.options.length,
      `Team ${team} options must be unique`,
    )
    invariant(
      draft.options.every((option) => option.word.trim().length > 0),
      `Team ${team} has an empty word`,
    )
    const replacementActions = draft.replacementActions
    invariant(
      replacementActions.length <= state.settings.seenRerollsPerDrawer,
      `Team ${team} exceeded word replacements`,
    )
    invariant(
      draft.seenOptionIds.length <= replacementActions.length,
      `Team ${team} Seen history exceeds replacement audit history`,
    )

    replacementActions.forEach((action, index) => {
      invariant(
        (WORD_REPLACEMENT_REASONS as readonly string[]).includes(action.reason),
        `Team ${team} has an invalid replacement reason`,
      )
      invariant(
        action.actorId === round.drawers[team],
        `Team ${team} replacement was not made by its drawer`,
      )
      invariant(
        action.serverTimeMs >= round.startedAtMs &&
          action.serverTimeMs < round.draftDeadlineAtMs,
        `Team ${team} replacement is outside the draft window`,
      )
      invariant(
        action.replacedOptionId !== action.replacementOptionId,
        `Team ${team} replacement did not change the option`,
      )
      if (index > 0) {
        invariant(
          action.serverTimeMs >=
            (
              replacementActions[
                index - 1
              ] as AuthoritativeWordReplacementAction
            ).serverTimeMs,
          `Team ${team} replacement timestamps are not monotonic`,
        )
      }
    })

    invariant(
      arraysEqual(
        draft.seenOptionIds,
        replacementActions
          .filter((action) => action.reason === 'seen-before')
          .map((action) => action.replacedOptionId),
      ),
      `Team ${team} Seen history disagrees with replacement audit history`,
    )

    if (draft.chosenOptionId !== null) {
      invariant(
        draft.options.some((option) => option.id === draft.chosenOptionId),
        `Team ${team} chose a missing option`,
      )
    }

    const solution = round.solutions[team]
    invariant(
      round.solved[team] === (solution !== null),
      `Team ${team} solved flag disagrees with solution`,
    )

    if (solution !== null) {
      const guesser = state.players.find(
        (player) => player.id === solution.guesserId,
      )
      invariant(
        guesser?.team === team,
        `Team ${team} solution came from another team`,
      )
      invariant(
        solution.guesserId !== round.drawers[team],
        `Team ${team} drawer cannot be its guesser`,
      )
      invariant(
        round.drawingDeadlineAtMs !== null,
        'a solution requires a drawing deadline',
      )
      invariant(
        solution.receivedAtMs <= round.drawingDeadlineAtMs,
        `Team ${team} solved after the deadline`,
      )
      const chosen = chosenWord(draft)
      const expectedPoints = calculateGuessScore({
        secondsRemaining:
          (round.drawingDeadlineAtMs - solution.receivedAtMs) / 1_000,
        roundSeconds: state.settings.drawingSeconds,
        difficulty: chosen.difficulty,
      })
      invariant(
        solution.points === expectedPoints,
        `Team ${team} solution points are inconsistent`,
      )
    }
  }

  if (state.phase === 'drawing' || state.phase === 'round-results') {
    invariant(
      round.drafts.A.chosenOptionId !== null &&
        round.drafts.B.chosenOptionId !== null,
      'drawing requires both chosen words',
    )
    invariant(
      round.drawingDeadlineAtMs !== null,
      'drawing requires an absolute deadline',
    )
  }

  const expectedScores: Record<TeamId, number> = {
    A: round.scoresBeforeRound.A + (round.solutions.A?.points ?? 0),
    B: round.scoresBeforeRound.B + (round.solutions.B?.points ?? 0),
  }

  if (state.phase === 'round-results') {
    const expectedWinner = determineRoundWinner(round.solutions)
    invariant(
      round.roundWinner === expectedWinner,
      'round winner is inconsistent with solutions',
    )
    const expectedShutdown =
      expectedWinner === null
        ? 0
        : calculateShutdownBounty({
            roundWinner: expectedWinner,
            scoresBeforeRound: round.scoresBeforeRound,
            activeStreakBeforeRound: round.streakBeforeRound,
          })
    invariant(
      round.shutdownBonus === expectedShutdown,
      'shutdown bonus is inconsistent',
    )
    if (expectedWinner !== null)
      expectedScores[expectedWinner] += expectedShutdown
    invariant(
      JSON.stringify(state.winStreak) ===
        JSON.stringify(
          updateWinStreak(round.streakBeforeRound, expectedWinner),
        ),
      'win streak is inconsistent',
    )
  } else {
    invariant(
      round.roundWinner === null && round.shutdownBonus === 0,
      'active round cannot have final results',
    )
    invariant(
      JSON.stringify(state.winStreak) ===
        JSON.stringify(round.streakBeforeRound),
      'active round changed win streak',
    )
  }

  invariant(
    state.scores.A === expectedScores.A && state.scores.B === expectedScores.B,
    'room scores are inconsistent with round results',
  )
  assertProjectionPrivacy(state)
}

function startRound(
  state: SimulationRoomState,
  serverTimeMs: number,
): SimulationRoomState {
  rule(
    state.phase === 'ready' || state.phase === 'round-results',
    'round.start is only allowed before or between rounds',
  )
  rule(
    state.completedRounds < state.settings.rounds,
    'configured rounds are complete',
  )

  const number = state.completedRounds + 1
  const drawers = getDrawersForRound(state.rosters, number)
  const teamA = drawWordOptions(state.rngState, state.settings.wordChoiceCount)
  const teamB = drawWordOptions(teamA.rngState, state.settings.wordChoiceCount)
  const emptyDraft = (options: readonly AuthoritativeWordOption[]) => ({
    options,
    seenOptionIds: [],
    replacementActions: [],
    chosenOptionId: null,
  })

  return {
    ...state,
    phase: 'word-draft',
    rngState: teamB.rngState,
    round: {
      number,
      drawers,
      drafts: {
        A: emptyDraft(teamA.options),
        B: emptyDraft(teamB.options),
      },
      solved: { A: false, B: false },
      draftDeadlineAtMs: addSeconds(
        serverTimeMs,
        state.settings.wordDraftSeconds,
      ),
      drawingDeadlineAtMs: null,
      startedAtMs: serverTimeMs,
      drawingStartedAtMs: null,
      scoresBeforeRound: { A: state.scores.A, B: state.scores.B },
      streakBeforeRound: state.winStreak,
      solutions: { A: null, B: null },
      roundWinner: null,
      shutdownBonus: 0,
    },
  }
}

function markWordSeen(
  state: SimulationRoomState,
  command: Extract<SimulationCommand, { type: 'word.seen' }>,
): SimulationRoomState {
  return replaceWord(state, {
    ...command,
    type: 'word.replace',
    reason: 'seen-before',
  })
}

function replaceWord(
  state: SimulationRoomState,
  command: Extract<SimulationCommand, { type: 'word.replace' }>,
): SimulationRoomState {
  const round = requireDraftCommand(
    state,
    command.team,
    command.actorId,
    command.serverTimeMs,
  )
  const draft = round.drafts[command.team]
  rule(draft.chosenOptionId === null, 'a chosen word cannot be replaced')
  rule(
    (WORD_REPLACEMENT_REASONS as readonly string[]).includes(command.reason),
    'unsupported word replacement reason',
  )
  const replacementActions = draft.replacementActions
  rule(
    replacementActions.length < state.settings.seenRerollsPerDrawer,
    'Word replacement limit reached',
  )
  const replaced = optionAt(draft, command.optionIndex)
  const replacement = drawReplacement(
    state.rngState,
    draft.options,
    replacementActions.map((action) => action.replacedOptionId),
  )
  const options = [...draft.options]
  options[command.optionIndex] = replacement.option
  const replacementAction: AuthoritativeWordReplacementAction = {
    reason: command.reason,
    actorId: command.actorId,
    replacedOptionId: replaced.id,
    replacementOptionId: replacement.option.id,
    serverTimeMs: command.serverTimeMs,
  }
  const nextDraft: SimulationTeamDraft = {
    options,
    seenOptionIds:
      command.reason === 'seen-before'
        ? [...draft.seenOptionIds, replaced.id]
        : draft.seenOptionIds,
    replacementActions: [...replacementActions, replacementAction],
    chosenOptionId: null,
  }

  return updateDraft(state, command.team, nextDraft, replacement.rngState)
}

function selectWord(
  state: SimulationRoomState,
  command: Extract<SimulationCommand, { type: 'word.select' }>,
): SimulationRoomState {
  const round = requireDraftCommand(
    state,
    command.team,
    command.actorId,
    command.serverTimeMs,
  )
  const draft = round.drafts[command.team]
  rule(draft.chosenOptionId === null, 'drawer already chose a word')
  const selected = optionAt(draft, command.optionIndex)

  return updateDraft(state, command.team, {
    ...draft,
    chosenOptionId: selected.id,
  })
}

function startDrawing(
  state: SimulationRoomState,
  serverTimeMs: number,
): SimulationRoomState {
  rule(state.phase === 'word-draft', 'drawing.start requires word-draft phase')
  const round = requireRound(state)
  const bothSelected =
    round.drafts.A.chosenOptionId !== null &&
    round.drafts.B.chosenOptionId !== null
  rule(
    bothSelected || serverTimeMs >= round.draftDeadlineAtMs,
    'drawing cannot start before both selections or the draft deadline',
  )

  let rngState = state.rngState
  const drafts = { ...round.drafts }

  for (const team of ['A', 'B'] as const) {
    if (drafts[team].chosenOptionId !== null) continue
    const random = nextRandom(rngState)
    rngState = random.rngState
    const option = drafts[team].options[
      Math.floor(random.value * drafts[team].options.length)
    ] as AuthoritativeWordOption
    drafts[team] = { ...drafts[team], chosenOptionId: option.id }
  }

  return {
    ...state,
    phase: 'drawing',
    rngState,
    round: {
      ...round,
      drafts,
      drawingStartedAtMs: serverTimeMs,
      drawingDeadlineAtMs: addSeconds(
        serverTimeMs,
        state.settings.drawingSeconds,
      ),
    },
  }
}

function recordCorrectGuess(
  state: SimulationRoomState,
  command: Extract<SimulationCommand, { type: 'guess.correct' }>,
): SimulationRoomState {
  rule(state.phase === 'drawing', 'guess.correct requires drawing phase')
  const round = requireRound(state)
  const deadline = round.drawingDeadlineAtMs as number
  rule(command.serverTimeMs <= deadline, 'guess arrived after drawing deadline')
  rule(round.solutions[command.team] === null, 'team already solved this round')
  const player = state.players.find(
    (candidate) => candidate.id === command.actorId,
  )
  rule(player?.team === command.team, 'guesser must belong to the scoring team')
  rule(
    round.drawers[command.team] !== command.actorId,
    'active drawer cannot submit a correct guess',
  )

  const selected = chosenWord(round.drafts[command.team])
  const points = calculateGuessScore({
    secondsRemaining: (deadline - command.serverTimeMs) / 1_000,
    roundSeconds: state.settings.drawingSeconds,
    difficulty: selected.difficulty,
  })

  return {
    ...state,
    scores: {
      ...state.scores,
      [command.team]: state.scores[command.team] + points,
    },
    round: {
      ...round,
      solved: { ...round.solved, [command.team]: true },
      solutions: {
        ...round.solutions,
        [command.team]: {
          guesserId: command.actorId,
          receivedAtMs: command.serverTimeMs,
          points,
        },
      },
    },
  }
}

function finishRound(
  state: SimulationRoomState,
  serverTimeMs: number,
): SimulationRoomState {
  rule(state.phase === 'drawing', 'round.finish requires drawing phase')
  const round = requireRound(state)
  const deadline = round.drawingDeadlineAtMs as number
  rule(
    (round.solved.A && round.solved.B) || serverTimeMs >= deadline,
    'round cannot finish while an unsolved team still has time',
  )

  const roundWinner = determineRoundWinner(round.solutions)
  const shutdownBonus =
    roundWinner === null
      ? 0
      : calculateShutdownBounty({
          roundWinner,
          scoresBeforeRound: round.scoresBeforeRound,
          activeStreakBeforeRound: round.streakBeforeRound,
        })

  return {
    ...state,
    phase: 'round-results',
    completedRounds: state.completedRounds + 1,
    scores:
      roundWinner === null || shutdownBonus === 0
        ? state.scores
        : {
            ...state.scores,
            [roundWinner]: state.scores[roundWinner] + shutdownBonus,
          },
    winStreak: updateWinStreak(round.streakBeforeRound, roundWinner),
    round: { ...round, roundWinner, shutdownBonus },
  }
}

function requireDraftCommand(
  state: SimulationRoomState,
  team: TeamId,
  actorId: PlayerId,
  serverTimeMs: number,
): SimulationRoundState {
  rule(state.phase === 'word-draft', 'word command requires word-draft phase')
  const round = requireRound(state)
  rule(
    serverTimeMs < round.draftDeadlineAtMs,
    'word command arrived at or after draft deadline',
  )
  rule(
    round.drawers[team] === actorId,
    'only the active team drawer may change its draft',
  )
  return round
}

function updateDraft(
  state: SimulationRoomState,
  team: TeamId,
  draft: SimulationTeamDraft,
  rngState = state.rngState,
): SimulationRoomState {
  const round = requireRound(state)
  return {
    ...state,
    rngState,
    round: {
      ...round,
      drafts: { ...round.drafts, [team]: draft },
    },
  }
}

function determineRoundWinner(
  solutions: SimulationRoundState['solutions'],
): TeamId | null {
  const aPoints = solutions.A?.points ?? 0
  const bPoints = solutions.B?.points ?? 0
  if (aPoints === bPoints) return null
  return aPoints > bPoints ? 'A' : 'B'
}

function assertProjectionPrivacy(state: SimulationRoomState): void {
  const round = requireRound(state)

  for (const viewer of state.players) {
    const view = projectPublicRoomView(state, {
      kind: 'player',
      playerId: viewer.id,
    })

    for (const team of ['A', 'B'] as const) {
      const chosen = view.round?.drafts[team].chosenWord
      if (round.drafts[team].chosenOptionId === null) {
        invariant(
          chosen?.visibility === 'pending',
          'unchosen word projection must be pending',
        )
        continue
      }

      const maySee = viewer.team === team && round.drawers[team] === viewer.id
      invariant(
        chosen?.visibility === (maySee ? 'drawer-only' : 'hidden'),
        `chosen word leaked to ${viewer.id}`,
      )
    }
  }

  const spectator = projectPublicRoomView(state, { kind: 'spectator' })
  for (const team of ['A', 'B'] as const) {
    const chosen = spectator.round?.drafts[team].chosenWord
    invariant(
      chosen?.visibility ===
        (round.drafts[team].chosenOptionId === null ? 'pending' : 'hidden'),
      `chosen word leaked to spectator for Team ${team}`,
    )
  }
}

function drawWordOptions(
  rngState: number,
  count: number,
): {
  readonly options: readonly AuthoritativeWordOption[]
  readonly rngState: number
} {
  const available = [...SIMULATION_WORD_BANK]
  const options: AuthoritativeWordOption[] = []
  let nextState = rngState

  for (let index = 0; index < count; index += 1) {
    const random = nextRandom(nextState)
    nextState = random.rngState
    const selectedIndex = Math.floor(random.value * available.length)
    const [selected] = available.splice(selectedIndex, 1)
    options.push(selected as AuthoritativeWordOption)
  }

  return { options, rngState: nextState }
}

function drawReplacement(
  rngState: number,
  currentOptions: readonly AuthoritativeWordOption[],
  previouslyReplacedOptionIds: readonly string[],
): { readonly option: AuthoritativeWordOption; readonly rngState: number } {
  const excluded = new Set([
    ...currentOptions.map((option) => option.id),
    ...previouslyReplacedOptionIds,
  ])
  const candidates = SIMULATION_WORD_BANK.filter(
    (word) => !excluded.has(word.id),
  )
  rule(candidates.length > 0, 'word bank has no unseen replacement')
  const random = nextRandom(rngState)
  return {
    option: candidates[
      Math.floor(random.value * candidates.length)
    ] as AuthoritativeWordOption,
    rngState: random.rngState,
  }
}

function nextRandom(rngState: number): {
  readonly rngState: number
  readonly value: number
} {
  const nextState = (rngState + 0x6d2b_79f5) >>> 0
  let value = nextState
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return {
    rngState: nextState,
    value: ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296,
  }
}

function mix32(value: number): number {
  let mixed = value >>> 0
  mixed ^= mixed >>> 16
  mixed = Math.imul(mixed, 0x7feb_352d)
  mixed ^= mixed >>> 15
  mixed = Math.imul(mixed, 0x846c_a68b)
  mixed ^= mixed >>> 16
  return mixed >>> 0
}

function firstGuesser(state: SimulationRoomState, team: TeamId): PlayerId {
  const round = requireRound(state)
  const guesser = state.rosters[team].find(
    (playerId) => playerId !== round.drawers[team],
  )
  if (guesser === undefined)
    throw new SimulationInvariantError(`Team ${team} has no guesser`)
  return guesser
}

function requireRound(state: SimulationRoomState): SimulationRoundState {
  if (state.round === null)
    throw new SimulationRuleError('room has no active or completed round')
  return state.round
}

function chosenWord(draft: AuthoritativeTeamDraft): AuthoritativeWordOption {
  const selected = draft.options.find(
    (option) => option.id === draft.chosenOptionId,
  )
  if (selected === undefined)
    throw new SimulationInvariantError('chosen word is missing from options')
  return selected
}

function optionAt(
  draft: AuthoritativeTeamDraft,
  optionIndex: number,
): AuthoritativeWordOption {
  rule(Number.isInteger(optionIndex), 'optionIndex must be an integer')
  const option = draft.options[optionIndex]
  rule(option !== undefined, 'optionIndex is outside the draft')
  return option
}

function validateCommandEnvelope(
  state: SimulationRoomState,
  command: SimulationCommand,
): void {
  rule(
    command.seq === state.roomSeq + 1,
    'command seq must be exactly roomSeq + 1',
  )
  assertSafeTimestamp(command.serverTimeMs, 'command.serverTimeMs')
  const previous = state.history.at(-1)
  rule(
    previous === undefined || command.serverTimeMs >= previous.serverTimeMs,
    'command server time must be monotonic',
  )
}

function validateSettings(settings: GameSettings): void {
  rule(
    Number.isInteger(settings.rounds) && settings.rounds > 0,
    'settings.rounds must be positive',
  )
  rule(
    Number.isInteger(settings.wordChoiceCount) &&
      settings.wordChoiceCount >= 2 &&
      settings.wordChoiceCount < SIMULATION_WORD_BANK.length,
    'wordChoiceCount is outside the simulation word bank',
  )
  rule(
    Number.isInteger(settings.seenRerollsPerDrawer) &&
      settings.seenRerollsPerDrawer >= 0,
    'seenRerollsPerDrawer must be non-negative',
  )
  for (const [name, value] of [
    ['wordDraftSeconds', settings.wordDraftSeconds],
    ['drawingSeconds', settings.drawingSeconds],
    ['roundResultsSeconds', settings.roundResultsSeconds],
  ] as const) {
    rule(
      Number.isSafeInteger(value) && value > 0,
      `${name} must be a positive integer`,
    )
  }
}

function validateTeamSize(size: number, team: TeamId): void {
  rule(
    Number.isInteger(size) && size >= 2,
    `Team ${team} size must be at least 2`,
  )
}

function validateRoomCode(roomCode: string): void {
  rule(
    /^[A-Z0-9]{4,8}$/.test(roomCode),
    'roomCode must be 4-8 uppercase letters or digits',
  )
}

function validateSeed(seed: number): void {
  rule(Number.isSafeInteger(seed), 'seed must be a safe integer')
}

function normalizeSeed(seed: number): number {
  return seed >>> 0
}

function addSeconds(timestampMs: number, seconds: number): number {
  const result = timestampMs + seconds * 1_000
  assertSafeTimestamp(result, 'deadline')
  return result
}

function assertSafeTimestamp(value: number, name: string): void {
  rule(
    Number.isSafeInteger(value) && value >= 0,
    `${name} must be a non-negative safe integer`,
  )
}

function arraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function rule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SimulationRuleError(message)
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SimulationInvariantError(message)
}
