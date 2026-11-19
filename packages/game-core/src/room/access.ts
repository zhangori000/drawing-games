import { otherTeam, TEAM_IDS } from '../types'
import { findActiveMember } from './members'
import type { CanvasAccess, RoomState } from './types'

const NONE: CanvasAccess = Object.freeze({ full: [], preview: [] })

/**
 * Which canvases a viewer may receive raw strokes for, per the contract
 * table. Non-members (and members who left) see previews during play and
 * everything in results and final stats.
 */
export function canvasAccessFor(
  state: RoomState,
  viewerId: string | null,
): CanvasAccess {
  const match = state.match
  if (match === null || state.phase === 'lobby') return NONE
  const viewer =
    viewerId === null ? undefined : findActiveMember(state, viewerId)

  switch (state.phase) {
    case 'word-draft':
    case 'drawing': {
      const round = match.round
      if (round === null) return NONE
      const canvases = TEAM_IDS.map((team) => round.teams[team].canvasId)
      if (viewer === undefined) return { full: [], preview: canvases }
      const own = round.teams[viewer.team]
      const opponent = round.teams[otherTeam(viewer.team)]
      const ownSolved = state.phase === 'drawing' && own.solution !== null
      return ownSolved
        ? { full: [own.canvasId, opponent.canvasId], preview: [] }
        : { full: [own.canvasId], preview: [opponent.canvasId] }
    }
    case 'round-results': {
      const round = match.round
      if (round === null) return NONE
      return {
        full: TEAM_IDS.map((team) => round.teams[team].canvasId),
        preview: [],
      }
    }
    case 'showdown': {
      const showdown = match.showdown
      if (showdown === null) return NONE
      const canvases = TEAM_IDS.map((team) => showdown.teams[team].canvasId)
      if (viewer === undefined) return { full: [], preview: canvases }
      const own = showdown.teams[viewer.team]
      const opponent = showdown.teams[otherTeam(viewer.team)]
      return own.finishedAtMs !== null
        ? { full: [own.canvasId, opponent.canvasId], preview: [] }
        : { full: [own.canvasId], preview: [opponent.canvasId] }
    }
    case 'stats':
      return {
        full: match.history.flatMap((round) =>
          TEAM_IDS.map((team) => round.teams[team].canvasId),
        ),
        preview: [],
      }
  }
}
