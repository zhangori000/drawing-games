import { describe, expect, it } from 'vitest'

import {
  PROTOCOL_VERSION,
  authoritativeDrawingDocumentDomainEventSchema,
  drawingDocumentSchema,
  drawingRoomSnapshotSchema,
  opponentDrawingActivityDomainEventSchema,
  parseDrawingDomainEvent,
  parseRoomSnapshotState,
  parseServerEventEnvelopeV1,
  typedRoomSnapshotServerEventSchema,
} from './index'

const dot = {
  id: 'dot_1',
  style: { color: '#181713', width: 0.012, opacity: 1 },
  points: [{ x: 0.45, y: 0.55, pressure: 0.8 }],
} as const

const teamDrawing = {
  strokesById: { dot_1: dot },
  strokeOrder: ['dot_1'],
} as const

describe('drawingDocumentSchema', () => {
  it('accepts a complete document including a one-point tap', () => {
    expect(drawingDocumentSchema.parse(teamDrawing)).toEqual(teamDrawing)
  })

  it.each([
    {
      name: 'a duplicate ordering reference',
      document: { ...teamDrawing, strokeOrder: ['dot_1', 'dot_1'] },
    },
    {
      name: 'an ordering reference with no stroke',
      document: { ...teamDrawing, strokeOrder: ['missing'] },
    },
    {
      name: 'an orphan stroke omitted from ordering',
      document: { ...teamDrawing, strokeOrder: [] },
    },
    {
      name: 'a record key that disagrees with stroke.id',
      document: {
        strokesById: { different_key: dot },
        strokeOrder: ['different_key'],
      },
    },
  ])('rejects $name', ({ document }) => {
    expect(drawingDocumentSchema.safeParse(document).success).toBe(false)
  })
})

describe('typed room snapshots', () => {
  it('represents a connection that has not joined yet', () => {
    expect(parseRoomSnapshotState({ kind: 'awaiting-join' })).toEqual({
      kind: 'awaiting-join',
    })
  })

  it('contains the viewer identity and exactly one team drawing', () => {
    const snapshot = {
      kind: 'drawing-room' as const,
      phase: 'drawing' as const,
      viewer: {
        playerId: 'player_a_drawer',
        team: 'A' as const,
        role: 'drawer' as const,
      },
      teamDrawing,
      canUndo: true,
      canRedo: false,
    }

    expect(drawingRoomSnapshotSchema.parse(snapshot)).toEqual(snapshot)
    expect(
      typedRoomSnapshotServerEventSchema.parse({
        type: 'room.snapshot',
        state: snapshot,
      }),
    ).toEqual({ type: 'room.snapshot', state: snapshot })
  })

  it('rejects an opponent document or an invented role instead of stripping it', () => {
    const base = {
      kind: 'drawing-room',
      phase: 'drawing',
      viewer: {
        playerId: 'player_a_guesser',
        team: 'A',
        role: 'guesser',
      },
      teamDrawing,
      canUndo: false,
      canRedo: true,
    }

    expect(
      drawingRoomSnapshotSchema.safeParse({
        ...base,
        opponentDrawing: teamDrawing,
      }).success,
    ).toBe(false)
    expect(
      drawingRoomSnapshotSchema.safeParse({
        ...base,
        viewer: { ...base.viewer, role: 'spectator' },
      }).success,
    ).toBe(false)
    expect(
      drawingRoomSnapshotSchema.safeParse({
        ...base,
        history: { past: [teamDrawing], future: [] },
      }).success,
    ).toBe(false)
  })

  it('requires both authoritative history capability flags', () => {
    const snapshotWithoutRedo = {
      kind: 'drawing-room',
      phase: 'drawing',
      viewer: {
        playerId: 'player_a_drawer',
        team: 'A',
        role: 'drawer',
      },
      teamDrawing,
      canUndo: true,
    }

    expect(
      drawingRoomSnapshotSchema.safeParse(snapshotWithoutRedo).success,
    ).toBe(false)
  })
})

describe('typed drawing domain events', () => {
  it('uses the v1 domain.event envelope for a same-team document', () => {
    const event = {
      type: 'domain.event' as const,
      name: 'drawing.document' as const,
      payload: {
        team: 'A' as const,
        document: teamDrawing,
        canUndo: true,
        canRedo: false,
      },
    }

    expect(parseDrawingDomainEvent(event)).toEqual(event)
    expect(authoritativeDrawingDocumentDomainEventSchema.parse(event)).toEqual(
      event,
    )

    expect(
      parseServerEventEnvelopeV1({
        version: PROTOCOL_VERSION,
        roomCode: 'DRAW1',
        roomSeq: 9,
        serverTimeMs: 1_800_000_000_000,
        event,
      }).event,
    ).toEqual(event)
  })

  it('allows only a coarse opponent activity signal without raw vectors', () => {
    const event = {
      type: 'domain.event' as const,
      name: 'drawing.opponent-activity' as const,
      payload: { team: 'B' as const, active: true as const },
    }

    expect(opponentDrawingActivityDomainEventSchema.parse(event)).toEqual(event)
    expect(
      opponentDrawingActivityDomainEventSchema.safeParse({
        ...event,
        payload: { ...event.payload, document: teamDrawing },
      }).success,
    ).toBe(false)
  })

  it('rejects malformed typed drawing events even though legacy domain events stay generic', () => {
    expect(
      authoritativeDrawingDocumentDomainEventSchema.safeParse({
        type: 'domain.event',
        name: 'drawing.document',
        payload: {
          team: 'C',
          document: teamDrawing,
          canUndo: true,
          canRedo: false,
        },
      }).success,
    ).toBe(false)

    expect(
      opponentDrawingActivityDomainEventSchema.safeParse({
        type: 'domain.event',
        name: 'drawing.opponent-activity',
        payload: { team: 'A', active: false },
      }).success,
    ).toBe(false)
  })

  it('requires capabilities without exposing reducer history', () => {
    const base = {
      type: 'domain.event',
      name: 'drawing.document',
      payload: {
        team: 'A',
        document: teamDrawing,
        canUndo: true,
        canRedo: false,
      },
    }

    expect(
      authoritativeDrawingDocumentDomainEventSchema.safeParse({
        ...base,
        payload: { team: 'A', document: teamDrawing, canUndo: true },
      }).success,
    ).toBe(false)
    expect(
      authoritativeDrawingDocumentDomainEventSchema.safeParse({
        ...base,
        payload: {
          ...base.payload,
          history: { past: [teamDrawing], future: [] },
        },
      }).success,
    ).toBe(false)
  })
})
