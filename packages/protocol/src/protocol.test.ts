import { describe, expect, it } from 'vitest'

import {
  PROTOCOL_VERSION,
  commandEnvelopeV1Schema,
  drawingOperationSchema,
  parseCommandEnvelopeV1,
  parseServerEventEnvelopeV1,
  serverEventEnvelopeV1Schema,
  type ClientCommand,
} from './index'

const envelopeFor = (command: ClientCommand) => ({
  version: PROTOCOL_VERSION,
  commandId: 'command_1',
  sessionId: 'session_1',
  roomCode: 'ABCD12',
  clientSeq: 1,
  lastRoomSeq: 0,
  command,
})

describe('commandEnvelopeV1Schema', () => {
  it.each<ClientCommand>([
    { type: 'room.resume' },
    { type: 'room.join', displayName: 'Orien' },
    { type: 'draft.select', optionId: 'word_1' },
    { type: 'draft.seen', optionId: 'word_1' },
    {
      type: 'draft.replace',
      optionId: 'word_1',
      reason: 'seen-before',
    },
    {
      type: 'draft.replace',
      optionId: 'word_2',
      reason: 'unknown-definition',
    },
    { type: 'guess.submit', text: 'otter' },
    { type: 'hint.vote', hint: 'word-length', approve: true },
    {
      type: 'drawing.batch',
      operations: [
        {
          type: 'stroke.begin',
          strokeId: 'stroke_1',
          point: { x: 0.1, y: 0.2, pressure: 0.5 },
          style: { color: '#123ABC', width: 0.01, opacity: 1 },
        },
        {
          type: 'stroke.append',
          strokeId: 'stroke_1',
          startPointIndex: 1,
          points: [{ x: 0.2, y: 0.3 }],
        },
        { type: 'stroke.end', strokeId: 'stroke_1', pointCount: 2 },
      ],
    },
    { type: 'surrender.vote', approve: true },
    { type: 'rematch.vote', mode: 'same-settings' },
  ])('accepts the supported command $type', (command) => {
    expect(parseCommandEnvelopeV1(envelopeFor(command)).command).toEqual(
      command,
    )
  })

  it('rejects unknown versions, extra fields, and zero client sequence numbers', () => {
    expect(
      commandEnvelopeV1Schema.safeParse({
        ...envelopeFor({ type: 'room.resume' }),
        version: 2,
      }).success,
    ).toBe(false)
    expect(
      commandEnvelopeV1Schema.safeParse({
        ...envelopeFor({ type: 'room.resume' }),
        clientSeq: 0,
      }).success,
    ).toBe(false)
    expect(
      commandEnvelopeV1Schema.safeParse({
        ...envelopeFor({ type: 'room.resume' }),
        unexpected: true,
      }).success,
    ).toBe(false)
  })

  it('rejects malformed drawing coordinates, styles, and empty appends', () => {
    expect(
      drawingOperationSchema.safeParse({
        type: 'stroke.begin',
        strokeId: 'stroke_1',
        point: { x: -0.01, y: 0.2 },
        style: { color: '#000000', width: 0.01, opacity: 1 },
      }).success,
    ).toBe(false)
    expect(
      drawingOperationSchema.safeParse({
        type: 'stroke.begin',
        strokeId: 'stroke_1',
        point: { x: 0.1, y: 0.2 },
        style: { color: 'black', width: 0.01, opacity: 1 },
      }).success,
    ).toBe(false)
    expect(
      drawingOperationSchema.safeParse({
        type: 'stroke.append',
        strokeId: 'stroke_1',
        startPointIndex: 1,
        points: [],
      }).success,
    ).toBe(false)
  })

  it('accepts a tap as one begin point followed by an end count of one', () => {
    const command: ClientCommand = {
      type: 'drawing.batch',
      operations: [
        {
          type: 'stroke.begin',
          strokeId: 'strawberry_seed_1',
          point: { x: 0.45, y: 0.55, pressure: 0.8 },
          style: { color: '#181713', width: 0.012, opacity: 1 },
        },
        {
          type: 'stroke.end',
          strokeId: 'strawberry_seed_1',
          pointCount: 1,
        },
      ],
    }

    expect(parseCommandEnvelopeV1(envelopeFor(command)).command).toEqual(
      command,
    )
  })

  it('requires an explicit supported reason for a word replacement', () => {
    expect(
      commandEnvelopeV1Schema.safeParse({
        ...envelopeFor({ type: 'room.resume' }),
        command: { type: 'draft.replace', optionId: 'word_1' },
      }).success,
    ).toBe(false)
    expect(
      commandEnvelopeV1Schema.safeParse({
        ...envelopeFor({ type: 'room.resume' }),
        command: {
          type: 'draft.replace',
          optionId: 'word_1',
          reason: 'too-hard',
        },
      }).success,
    ).toBe(false)
  })
})

describe('serverEventEnvelopeV1Schema', () => {
  it.each([
    {
      type: 'command.ack' as const,
      commandId: 'command_1',
      clientSeq: 1,
      status: 'applied' as const,
    },
    {
      type: 'room.snapshot' as const,
      state: { phase: 'drawing', deadlineMs: 1_800_000_000_000 },
    },
    {
      type: 'domain.event' as const,
      name: 'guess.correct',
      payload: { playerId: 'player_1' },
    },
    {
      type: 'protocol.error' as const,
      code: 'STALE_CLIENT' as const,
      message: 'Resume from a fresh room snapshot',
      retryable: true,
      commandId: 'command_1',
    },
  ])('accepts server event $type', (event) => {
    const envelope = {
      version: PROTOCOL_VERSION,
      roomCode: 'ABCD12',
      roomSeq: 42,
      serverTimeMs: 1_800_000_000_000,
      event,
    }

    expect(parseServerEventEnvelopeV1(envelope)).toEqual(envelope)
  })

  it('requires JSON-safe event payloads and rejects non-canonical room codes', () => {
    const result = serverEventEnvelopeV1Schema.safeParse({
      version: PROTOCOL_VERSION,
      roomCode: 'abcd12',
      roomSeq: 1,
      serverTimeMs: Date.now(),
      event: {
        type: 'domain.event',
        name: 'round.started',
        payload: { invalid: BigInt(1) },
      },
    })

    expect(result.success).toBe(false)
  })
})
