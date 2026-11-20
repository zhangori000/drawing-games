import { describe, expect, it } from 'vitest'

import {
  MAX_CUSTOM_WORD_LENGTH,
  PROTOCOL_VERSION,
  commandEnvelopeV1Schema,
  drawingOperationSchema,
  parseCommandEnvelopeV1,
  parseServerEventEnvelopeV1,
  MAX_COMMAND_MESSAGE_BYTES,
  messageTooLargeDetailsSchema,
  rateLimitDetailsSchema,
  roomSettingsPatchSchema,
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
    { type: 'canvas.sync' },
    { type: 'surrender.vote', approve: true },
    { type: 'rematch.vote', mode: 'same-settings' },
  ])('accepts the supported command $type', (command) => {
    expect(parseCommandEnvelopeV1(envelopeFor(command)).command).toEqual(
      command,
    )
  })

  it("accepts a guest browser's soft and strict word memory on join, capped", () => {
    const join: ClientCommand = {
      type: 'room.join',
      displayName: 'Orien',
      recentWordIds: ['animals/cat'],
      recentAvoidIds: ['space-science/conveyor-belt'],
    }
    expect(parseCommandEnvelopeV1(envelopeFor(join)).command).toEqual(join)
    const tooMany = Array.from({ length: 301 }, (_, index) => `p/w${index}`)
    expect(
      commandEnvelopeV1Schema.safeParse(
        envelopeFor({ ...join, recentAvoidIds: tooMany }),
      ).success,
    ).toBe(false)
    expect(
      commandEnvelopeV1Schema.safeParse(
        envelopeFor({ ...join, recentAvoidIds: ['Not An Id'] }),
      ).success,
    ).toBe(false)
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

  it('carries an optional, well-formed canvas id on drawing batches', () => {
    const operations = [{ type: 'drawing.clear' as const }]
    const withCanvas: ClientCommand = {
      type: 'drawing.batch',
      canvasId: 'm1-sd-A-2',
      operations,
    }
    expect(parseCommandEnvelopeV1(envelopeFor(withCanvas)).command).toEqual(
      withCanvas,
    )
    // Older clients send no canvas id; the room then uses the current one.
    const legacy: ClientCommand = { type: 'drawing.batch', operations }
    expect(parseCommandEnvelopeV1(envelopeFor(legacy)).command).toEqual(legacy)
    for (const canvasId of ['', 'm1 r1 A', 'x'.repeat(65), 7, null]) {
      expect(
        commandEnvelopeV1Schema.safeParse({
          ...envelopeFor(legacy),
          command: { type: 'drawing.batch', canvasId, operations },
        }).success,
      ).toBe(false)
    }
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

  it('limits custom words by characters (code points), like the room', () => {
    const accepts = (customWords: string[]) =>
      roomSettingsPatchSchema.safeParse({ customWords }).success
    // An emoji is one character for the room but two UTF-16 units.
    expect(accepts(['🎉'.repeat(MAX_CUSTOM_WORD_LENGTH)])).toBe(true)
    expect(accepts(['é'.repeat(MAX_CUSTOM_WORD_LENGTH), '  kite  '])).toBe(true)
    expect(accepts(['🎉'.repeat(MAX_CUSTOM_WORD_LENGTH + 1)])).toBe(false)
    expect(accepts(['y'.repeat(MAX_CUSTOM_WORD_LENGTH + 1)])).toBe(false)
    expect(accepts(['   '])).toBe(false)
  })

  it('does not count a difficulty tag toward a custom word’s length', () => {
    const accepts = (customWords: string[]) =>
      roomSettingsPatchSchema.safeParse({ customWords }).success
    const longest = 'y'.repeat(MAX_CUSTOM_WORD_LENGTH)
    expect(accepts([`${longest}|medium`, `${longest} | HARD`])).toBe(true)
    expect(accepts([`${longest}y|easy`])).toBe(false)
    // Not a tag: it counts, like any other characters.
    expect(accepts([`${longest}|huge`])).toBe(false)
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

  it('carries a retry delay on RATE_LIMITED errors', () => {
    const envelope = parseServerEventEnvelopeV1({
      version: PROTOCOL_VERSION,
      roomCode: 'ABCD12',
      roomSeq: 3,
      serverTimeMs: 1_800_000_000_000,
      event: {
        type: 'protocol.error',
        code: 'RATE_LIMITED',
        message: 'Too many actions at once. Wait a moment and try again.',
        retryable: true,
        commandId: 'command_1',
        details: { retryAfterMs: 200 },
      },
    })
    if (envelope.event.type !== 'protocol.error')
      throw new Error('expected an error')
    expect(rateLimitDetailsSchema.parse(envelope.event.details)).toEqual({
      retryAfterMs: 200,
    })
    // Lenient: later fields do not break older clients.
    expect(
      rateLimitDetailsSchema.safeParse({ retryAfterMs: 50, lane: 'drawing' })
        .success,
    ).toBe(true)
    expect(rateLimitDetailsSchema.safeParse({ retryAfterMs: 0 }).success).toBe(
      false,
    )
  })

  it('describes an oversized message, naming its command when known', () => {
    const envelope = parseServerEventEnvelopeV1({
      version: PROTOCOL_VERSION,
      roomCode: 'ABCD12',
      roomSeq: 3,
      serverTimeMs: 1,
      event: {
        type: 'protocol.error',
        code: 'BAD_COMMAND',
        message: 'Commands are limited to 64 KiB.',
        retryable: false,
        commandId: 'command_9',
        details: {
          reason: 'message-too-large',
          maxBytes: MAX_COMMAND_MESSAGE_BYTES,
        },
      },
    })
    if (envelope.event.type !== 'protocol.error')
      throw new Error('expected an error')
    expect(messageTooLargeDetailsSchema.parse(envelope.event.details)).toEqual({
      reason: 'message-too-large',
      maxBytes: 64 * 1024,
    })
    expect(
      messageTooLargeDetailsSchema.safeParse({ retryAfterMs: 50 }).success,
    ).toBe(false)
  })
})
