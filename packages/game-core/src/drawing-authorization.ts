import type { DrawersByTeam, GamePhaseName, PlayerId, TeamId } from './types'

export interface DrawingRoomMember {
  readonly id: PlayerId
  readonly team: TeamId
}

export interface DrawingSubmissionAuthorizationInput {
  readonly phase: GamePhaseName
  readonly playerId: PlayerId
  readonly members: readonly DrawingRoomMember[]
  readonly drawers: DrawersByTeam | null
}

export type DrawingSubmissionDenialReason =
  | 'phase-not-drawing'
  | 'player-not-member'
  | 'ambiguous-membership'
  | 'drawers-unavailable'
  | 'not-current-drawer'

export type DrawingSubmissionAuthorization =
  | { readonly allowed: true; readonly team: TeamId }
  | {
      readonly allowed: false
      readonly reason: DrawingSubmissionDenialReason
    }

/**
 * Authorizes drawing from authoritative room membership, never a client-claimed
 * team or role. Ambiguous membership fails closed instead of choosing a team.
 */
export function getDrawingSubmissionAuthorization(
  input: DrawingSubmissionAuthorizationInput,
): DrawingSubmissionAuthorization {
  if (input.phase !== 'drawing') {
    return { allowed: false, reason: 'phase-not-drawing' }
  }

  const memberships = input.members.filter(
    (member) => member.id === input.playerId,
  )

  if (memberships.length === 0) {
    return { allowed: false, reason: 'player-not-member' }
  }

  if (memberships.length !== 1) {
    return { allowed: false, reason: 'ambiguous-membership' }
  }

  if (input.drawers === null) {
    return { allowed: false, reason: 'drawers-unavailable' }
  }

  const membership = memberships[0]
  if (!membership || input.drawers[membership.team] !== input.playerId) {
    return { allowed: false, reason: 'not-current-drawer' }
  }

  return { allowed: true, team: membership.team }
}

export function canPlayerSubmitDrawing(
  input: DrawingSubmissionAuthorizationInput,
): boolean {
  return getDrawingSubmissionAuthorization(input).allowed
}
