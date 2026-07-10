import type { GameSettings, SurrenderSettings } from './settings'
import type {
  DrawersByTeam,
  GamePhaseName,
  PlayerId,
  TeamId,
  TeamRosters,
  TeamScores,
  TimedPhaseName,
  UntimedPhaseName,
} from './types'
import { TIMED_PHASES, otherTeam } from './types'

export interface UntimedPhaseState {
  readonly type: UntimedPhaseName
  readonly enteredAtMs: number
}

export interface TimedPhaseState {
  readonly type: TimedPhaseName
  readonly enteredAtMs: number
  /** Absolute server timestamp; reconnecting clients derive remaining time. */
  readonly deadlineAtMs: number
}

export type PhaseState = UntimedPhaseState | TimedPhaseState

export const PHASE_TRANSITIONS = Object.freeze({
  lobby: Object.freeze(['settings'] as const),
  settings: Object.freeze(['lobby', 'ready'] as const),
  ready: Object.freeze(['settings', 'word-draft'] as const),
  'word-draft': Object.freeze(['drawing'] as const),
  drawing: Object.freeze(['round-results'] as const),
  'round-results': Object.freeze(['word-draft', 'showdown'] as const),
  showdown: Object.freeze(['stats'] as const),
  stats: Object.freeze(['rematch'] as const),
  rematch: Object.freeze(['lobby', 'settings', 'ready'] as const),
}) satisfies Readonly<Record<GamePhaseName, readonly GamePhaseName[]>>

export function isTimedPhase(phase: GamePhaseName): phase is TimedPhaseName {
  return (TIMED_PHASES as readonly GamePhaseName[]).includes(phase)
}

export function canTransition(from: GamePhaseName, to: GamePhaseName): boolean {
  const allowed = PHASE_TRANSITIONS[from] as readonly GamePhaseName[]
  return allowed.includes(to)
}

export function createPhaseState(
  phase: UntimedPhaseName,
  enteredAtMs: number,
): UntimedPhaseState
export function createPhaseState(
  phase: TimedPhaseName,
  enteredAtMs: number,
  durationSeconds: number,
): TimedPhaseState
export function createPhaseState(
  phase: GamePhaseName,
  enteredAtMs: number,
  durationSeconds?: number,
): PhaseState {
  assertTimestamp(enteredAtMs, 'enteredAtMs')

  if (!isTimedPhase(phase)) {
    if (durationSeconds !== undefined) {
      throw new Error(`Untimed phase \"${phase}\" cannot have a duration`)
    }

    return { type: phase, enteredAtMs }
  }

  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds === undefined ||
    durationSeconds <= 0
  ) {
    throw new Error(`Timed phase \"${phase}\" requires a positive duration`)
  }

  return {
    type: phase,
    enteredAtMs,
    deadlineAtMs: enteredAtMs + durationSeconds * 1_000,
  }
}

export function transitionPhase(
  current: PhaseState,
  next: UntimedPhaseName,
  enteredAtMs: number,
): UntimedPhaseState
export function transitionPhase(
  current: PhaseState,
  next: TimedPhaseName,
  enteredAtMs: number,
  durationSeconds: number,
): TimedPhaseState
export function transitionPhase(
  current: PhaseState,
  next: GamePhaseName,
  enteredAtMs: number,
  durationSeconds?: number,
): PhaseState {
  if (!canTransition(current.type, next)) {
    throw new Error(`Invalid phase transition: ${current.type} -> ${next}`)
  }

  if (isTimedPhase(next)) {
    if (durationSeconds === undefined) {
      throw new Error(`Timed phase \"${next}\" requires a positive duration`)
    }
    return createPhaseState(next, enteredAtMs, durationSeconds)
  }

  return createPhaseState(next, enteredAtMs)
}

export function getPhaseMillisecondsRemaining(
  phase: PhaseState,
  serverNowMs: number,
): number | null {
  assertTimestamp(serverNowMs, 'serverNowMs')

  if (!('deadlineAtMs' in phase)) {
    return null
  }

  return Math.max(0, phase.deadlineAtMs - serverNowMs)
}

export function hasPhaseDeadlineElapsed(
  phase: PhaseState,
  serverNowMs: number,
): boolean {
  const remaining = getPhaseMillisecondsRemaining(phase, serverNowMs)
  return remaining !== null && remaining === 0
}

export function nextPhaseAfterRound(
  completedRounds: number,
  settings: Pick<GameSettings, 'rounds'>,
): 'word-draft' | 'showdown' {
  assertNonNegativeInteger(completedRounds, 'completedRounds')
  assertPositiveInteger(settings.rounds, 'settings.rounds')

  return completedRounds >= settings.rounds ? 'showdown' : 'word-draft'
}

/** Returns one drawer per team using an independent, stable round-robin. */
export function getDrawersForRound(
  rosters: TeamRosters,
  roundNumber: number,
): DrawersByTeam {
  validateRosters(rosters)
  assertPositiveInteger(roundNumber, 'roundNumber')

  return {
    A: rosters.A[(roundNumber - 1) % rosters.A.length] as PlayerId,
    B: rosters.B[(roundNumber - 1) % rosters.B.length] as PlayerId,
  }
}

export function createDrawerSchedule(
  rosters: TeamRosters,
  roundCount: number,
): readonly DrawersByTeam[] {
  assertNonNegativeInteger(roundCount, 'roundCount')
  validateRosters(rosters)

  return Array.from({ length: roundCount }, (_, index) =>
    getDrawersForRound(rosters, index + 1),
  )
}

/** Surrender votes open only between rounds so they never interrupt drawing. */
export const SURRENDER_PHASES = [
  'round-results',
] as const satisfies readonly GamePhaseName[]

export type SurrenderIneligibilityReason =
  | 'disabled'
  | 'phase-not-active'
  | 'too-early'
  | 'not-trailing'
  | 'deficit-too-small'

export type SurrenderEligibility =
  | { readonly eligible: true; readonly deficit: number }
  | {
      readonly eligible: false
      readonly deficit: number
      readonly reason: SurrenderIneligibilityReason
    }

export interface SurrenderEligibilityInput {
  readonly team: TeamId
  readonly scores: TeamScores
  readonly completedRounds: number
  readonly phase: GamePhaseName
  readonly settings: SurrenderSettings
}

/**
 * Either team may surrender when it is the trailing team; this helper applies
 * the same rule symmetrically to A and B.
 */
export function getSurrenderEligibility(
  input: SurrenderEligibilityInput,
): SurrenderEligibility {
  const deficit = Math.max(
    0,
    normalizeScore(input.scores[otherTeam(input.team)]) -
      normalizeScore(input.scores[input.team]),
  )

  if (!input.settings.enabled) {
    return { eligible: false, deficit, reason: 'disabled' }
  }

  if (!(SURRENDER_PHASES as readonly GamePhaseName[]).includes(input.phase)) {
    return { eligible: false, deficit, reason: 'phase-not-active' }
  }

  if (input.completedRounds < input.settings.minimumCompletedRounds) {
    return { eligible: false, deficit, reason: 'too-early' }
  }

  if (deficit === 0) {
    return { eligible: false, deficit, reason: 'not-trailing' }
  }

  if (deficit < input.settings.minimumPointDeficit) {
    return { eligible: false, deficit, reason: 'deficit-too-small' }
  }

  return { eligible: true, deficit }
}

export function canTeamSurrender(input: SurrenderEligibilityInput): boolean {
  return getSurrenderEligibility(input).eligible
}

export type RematchChoice = 'same-settings' | 'change-settings'

export function phaseForRematchChoice(
  choice: RematchChoice,
): 'ready' | 'settings' {
  return choice === 'same-settings' ? 'ready' : 'settings'
}

function validateRosters(rosters: TeamRosters): void {
  const allPlayers = [...rosters.A, ...rosters.B]

  if (rosters.A.length === 0 || rosters.B.length === 0) {
    throw new Error(
      'Each team needs at least one player in its drawer rotation',
    )
  }

  if (allPlayers.some((playerId) => playerId.trim().length === 0)) {
    throw new Error('Drawer rotations cannot contain an empty player id')
  }

  if (new Set(allPlayers).size !== allPlayers.length) {
    throw new Error('A player may appear only once across drawer rotations')
  }
}

function normalizeScore(score: number): number {
  return Number.isFinite(score) ? Math.max(0, score) : 0
}

function assertTimestamp(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite timestamp`)
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
}
