import { describe, expect, it } from 'vitest'

import {
  canPlayerSubmitDrawing,
  getDrawingSubmissionAuthorization,
  type DrawingSubmissionAuthorizationInput,
} from './drawing-authorization'

const drawingRoom: DrawingSubmissionAuthorizationInput = {
  phase: 'drawing',
  playerId: 'a-drawer',
  members: [
    { id: 'a-drawer', team: 'A' },
    { id: 'a-guesser', team: 'A' },
    { id: 'b-drawer', team: 'B' },
    { id: 'b-guesser', team: 'B' },
  ],
  drawers: { A: 'a-drawer', B: 'b-drawer' },
}

describe('getDrawingSubmissionAuthorization', () => {
  it.each([
    ['a-drawer', 'A'],
    ['b-drawer', 'B'],
  ] as const)(
    'allows the current %s and returns the authoritative team',
    (playerId, team) => {
      expect(
        getDrawingSubmissionAuthorization({ ...drawingRoom, playerId }),
      ).toEqual({ allowed: true, team })
    },
  )

  it('rejects a team member who is not that team current drawer', () => {
    const input = { ...drawingRoom, playerId: 'a-guesser' }

    expect(getDrawingSubmissionAuthorization(input)).toEqual({
      allowed: false,
      reason: 'not-current-drawer',
    })
    expect(canPlayerSubmitDrawing(input)).toBe(false)
  })

  it('rejects a drawer outside the drawing phase', () => {
    expect(
      getDrawingSubmissionAuthorization({
        ...drawingRoom,
        phase: 'word-draft',
      }),
    ).toEqual({ allowed: false, reason: 'phase-not-drawing' })
  })

  it('rejects an identity that is not an authoritative member', () => {
    expect(
      getDrawingSubmissionAuthorization({
        ...drawingRoom,
        playerId: 'socket-claimed-drawer',
      }),
    ).toEqual({ allowed: false, reason: 'player-not-member' })
  })

  it('fails closed when current drawers are unavailable', () => {
    expect(
      getDrawingSubmissionAuthorization({ ...drawingRoom, drawers: null }),
    ).toEqual({ allowed: false, reason: 'drawers-unavailable' })
  })

  it('fails closed when corrupted membership assigns one player twice', () => {
    expect(
      getDrawingSubmissionAuthorization({
        ...drawingRoom,
        members: [...drawingRoom.members, { id: 'a-drawer', team: 'B' }],
      }),
    ).toEqual({ allowed: false, reason: 'ambiguous-membership' })
  })

  it('does not authorize a player from the drawer slot of another team', () => {
    expect(
      getDrawingSubmissionAuthorization({
        ...drawingRoom,
        drawers: { A: 'someone-else', B: 'a-drawer' },
      }),
    ).toEqual({ allowed: false, reason: 'not-current-drawer' })
  })
})
