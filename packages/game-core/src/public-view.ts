import type { OpponentDraftVisibility } from './settings'
import type {
  DrawersByTeam,
  GamePhaseName,
  PlayerId,
  TeamId,
  TeamScores,
  WordDifficulty,
  WordReplacementReason,
} from './types'

export interface RoomPlayer {
  readonly id: PlayerId
  readonly displayName: string
  readonly team: TeamId
}

export interface AuthoritativeWordOption {
  readonly id: string
  readonly word: string
  readonly difficulty: WordDifficulty
}

export interface AuthoritativeWordReplacementAction {
  readonly reason: WordReplacementReason
  readonly actorId: PlayerId
  readonly replacedOptionId: string
  readonly replacementOptionId: string
  /** Authoritative receipt time; clients cannot supply or revise it. */
  readonly serverTimeMs: number
}

export interface AuthoritativeTeamDraft {
  readonly options: readonly AuthoritativeWordOption[]
  /** @deprecated Use replacementActions for reasoned audit history. */
  readonly seenOptionIds: readonly string[]
  /** Optional only so pre-audit snapshots remain projectable. */
  readonly replacementActions?: readonly AuthoritativeWordReplacementAction[]
  readonly chosenOptionId: string | null
}

export interface AuthoritativeRoundViewSource {
  readonly number: number
  readonly drawers: DrawersByTeam
  readonly drafts: Readonly<Record<TeamId, AuthoritativeTeamDraft>>
  readonly solved: Readonly<Record<TeamId, boolean>>
  readonly draftDeadlineAtMs: number
  readonly drawingDeadlineAtMs: number | null
}

/**
 * The minimum authoritative state accepted by the public-view boundary.
 * Server-only state may extend this shape, but the projector deliberately
 * copies fields one by one instead of spreading that state onto the wire.
 */
export interface AuthoritativeRoomViewSource {
  readonly roomCode: string
  readonly roomSeq: number
  readonly phase: GamePhaseName
  readonly scores: TeamScores
  readonly players: readonly RoomPlayer[]
  readonly opponentDraftVisibility: OpponentDraftVisibility
  readonly round: AuthoritativeRoundViewSource | null
}

/** Caller identity only. Role is always derived from authoritative room state. */
export type RoomAudience =
  | { readonly kind: 'player'; readonly playerId: PlayerId }
  | { readonly kind: 'spectator' }

export type PublicViewerRole =
  'active-drawer' | 'guesser' | 'waiting-player' | 'spectator'

export interface PublicViewer {
  readonly audience: 'player' | 'spectator'
  readonly playerId?: PlayerId
  readonly team?: TeamId
  readonly role: PublicViewerRole
}

export interface PublicRoomPlayer {
  readonly id: PlayerId
  readonly displayName: string
  readonly team: TeamId
  readonly roundRole: 'drawer' | 'guesser' | 'waiting'
}

export interface PublicWordOption {
  readonly id: string
  readonly word: string
  readonly difficulty: WordDifficulty
}

export type PublicChosenWord =
  | { readonly visibility: 'pending' }
  | { readonly visibility: 'hidden' }
  | {
      readonly visibility: 'drawer-only'
      readonly optionId: string
      readonly word: string
      readonly difficulty: WordDifficulty
    }

export interface PublicWordReplacementAction {
  readonly reason: WordReplacementReason
  /** null identifies a legacy Seen record created before audit timestamps. */
  readonly serverTimeMs: number | null
}

export interface PublicTeamDraft {
  /** null means this audience is not allowed to receive candidate text. */
  readonly options: readonly PublicWordOption[] | null
  /** null hides even the existence/count of Seen actions from this audience. */
  readonly seenActionCount: number | null
  /**
   * Reason-only audit trail. Option ids and actor ids stay authoritative so
   * this cannot become a side channel for hidden word candidates.
   */
  readonly replacementActions: readonly PublicWordReplacementAction[] | null
  readonly chosenWord: PublicChosenWord
}

export interface PublicRoundView {
  readonly number: number
  readonly drawers: DrawersByTeam
  readonly drafts: Readonly<Record<TeamId, PublicTeamDraft>>
  readonly solved: Readonly<Record<TeamId, boolean>>
  readonly draftDeadlineAtMs: number
  readonly drawingDeadlineAtMs: number | null
}

export interface PublicRoomView {
  readonly roomCode: string
  readonly roomSeq: number
  readonly phase: GamePhaseName
  readonly scores: TeamScores
  readonly viewer: PublicViewer
  readonly players: readonly PublicRoomPlayer[]
  readonly round: PublicRoundView | null
}

/**
 * Projects a fresh audience-safe object. Unknown player identities fail closed
 * to spectator access, and callers cannot claim a drawer role themselves.
 */
export function projectPublicRoomView(
  state: AuthoritativeRoomViewSource,
  audience: RoomAudience,
): PublicRoomView {
  const viewerPlayer =
    audience.kind === 'player'
      ? (state.players.find((player) => player.id === audience.playerId) ??
        null)
      : null
  const viewer = projectViewer(state.round, viewerPlayer)

  return {
    roomCode: state.roomCode,
    roomSeq: state.roomSeq,
    phase: state.phase,
    scores: { A: state.scores.A, B: state.scores.B },
    viewer,
    players: state.players.map((player) => ({
      id: player.id,
      displayName: player.displayName,
      team: player.team,
      roundRole: getRoundRole(state.round, player),
    })),
    round:
      state.round === null
        ? null
        : projectRound(
            state.round,
            state.phase,
            state.opponentDraftVisibility,
            viewerPlayer,
          ),
  }
}

function projectViewer(
  round: AuthoritativeRoundViewSource | null,
  player: RoomPlayer | null,
): PublicViewer {
  if (player === null) {
    return { audience: 'spectator', role: 'spectator' }
  }

  const roundRole = getRoundRole(round, player)
  return {
    audience: 'player',
    playerId: player.id,
    team: player.team,
    role:
      roundRole === 'drawer'
        ? 'active-drawer'
        : roundRole === 'guesser'
          ? 'guesser'
          : 'waiting-player',
  }
}

function getRoundRole(
  round: AuthoritativeRoundViewSource | null,
  player: RoomPlayer,
): PublicRoomPlayer['roundRole'] {
  if (round === null) return 'waiting'
  return round.drawers[player.team] === player.id ? 'drawer' : 'guesser'
}

function projectRound(
  round: AuthoritativeRoundViewSource,
  phase: GamePhaseName,
  opponentDraftVisibility: OpponentDraftVisibility,
  viewer: RoomPlayer | null,
): PublicRoundView {
  return {
    number: round.number,
    drawers: { A: round.drawers.A, B: round.drawers.B },
    drafts: {
      A: projectTeamDraft(
        round.drafts.A,
        'A',
        round,
        phase,
        opponentDraftVisibility,
        viewer,
      ),
      B: projectTeamDraft(
        round.drafts.B,
        'B',
        round,
        phase,
        opponentDraftVisibility,
        viewer,
      ),
    },
    solved: { A: round.solved.A, B: round.solved.B },
    draftDeadlineAtMs: round.draftDeadlineAtMs,
    drawingDeadlineAtMs: round.drawingDeadlineAtMs,
  }
}

function projectTeamDraft(
  draft: AuthoritativeTeamDraft,
  draftTeam: TeamId,
  round: AuthoritativeRoundViewSource,
  phase: GamePhaseName,
  opponentDraftVisibility: OpponentDraftVisibility,
  viewer: RoomPlayer | null,
): PublicTeamDraft {
  const isOwningDrawer =
    viewer !== null &&
    viewer.team === draftTeam &&
    round.drawers[draftTeam] === viewer.id
  const isOpponent = viewer !== null && viewer.team !== draftTeam
  const mayObserveOpponentDraft = isOpponent && phase === 'word-draft'
  const optionsVisible =
    isOwningDrawer ||
    (mayObserveOpponentDraft &&
      opponentDraftVisibility === 'options-and-actions')
  const actionsVisible =
    isOwningDrawer ||
    (mayObserveOpponentDraft && opponentDraftVisibility !== 'hidden')
  const replacementActions = getReplacementActions(draft)

  return {
    options: optionsVisible
      ? draft.options.map((option) => ({
          id: option.id,
          word: option.word,
          difficulty: option.difficulty,
        }))
      : null,
    seenActionCount: actionsVisible
      ? replacementActions.filter((action) => action.reason === 'seen-before')
          .length
      : null,
    replacementActions: actionsVisible ? replacementActions : null,
    chosenWord: projectChosenWord(draft, isOwningDrawer),
  }
}

function getReplacementActions(
  draft: AuthoritativeTeamDraft,
): readonly PublicWordReplacementAction[] {
  if (draft.replacementActions !== undefined) {
    return draft.replacementActions.map((action) => ({
      reason: action.reason,
      serverTimeMs: action.serverTimeMs,
    }))
  }

  return draft.seenOptionIds.map(() => ({
    reason: 'seen-before',
    serverTimeMs: null,
  }))
}

function projectChosenWord(
  draft: AuthoritativeTeamDraft,
  isOwningDrawer: boolean,
): PublicChosenWord {
  if (draft.chosenOptionId === null) {
    return { visibility: 'pending' }
  }

  if (!isOwningDrawer) {
    return { visibility: 'hidden' }
  }

  const chosen = draft.options.find(
    (option) => option.id === draft.chosenOptionId,
  )

  if (chosen === undefined) {
    // Malformed server state must fail closed instead of exposing a guessed or
    // stale value. The invariant checker reports this corruption separately.
    return { visibility: 'hidden' }
  }

  return {
    visibility: 'drawer-only',
    optionId: chosen.id,
    word: chosen.word,
    difficulty: chosen.difficulty,
  }
}
