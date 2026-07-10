import { z } from 'zod'

import {
  PROTOCOL_VERSION,
  commandIdSchema,
  roomCodeSchema,
  sequenceSchema,
} from './shared'

const domainEventNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/)

export const ackServerEventSchema = z.strictObject({
  type: z.literal('command.ack'),
  commandId: commandIdSchema,
  clientSeq: sequenceSchema.refine((value) => value > 0),
  status: z.enum(['applied', 'duplicate']),
})

/** Room state remains domain-owned; the protocol guarantees JSON-safe transport. */
export const snapshotServerEventSchema = z.strictObject({
  type: z.literal('room.snapshot'),
  state: z.json(),
})

/** Public domain events are named and versioned by the enclosing protocol. */
export const domainServerEventSchema = z.strictObject({
  type: z.literal('domain.event'),
  name: domainEventNameSchema,
  payload: z.json(),
})

export const protocolErrorCodeSchema = z.enum([
  'BAD_COMMAND',
  'UNAUTHORIZED',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'NOT_ALLOWED',
  'STALE_CLIENT',
  'RATE_LIMITED',
  'INTERNAL',
])

export const errorServerEventSchema = z.strictObject({
  type: z.literal('protocol.error'),
  code: protocolErrorCodeSchema,
  message: z.string().min(1).max(512),
  retryable: z.boolean(),
  commandId: commandIdSchema.optional(),
  details: z.json().optional(),
})

export const serverEventSchema = z.discriminatedUnion('type', [
  ackServerEventSchema,
  snapshotServerEventSchema,
  domainServerEventSchema,
  errorServerEventSchema,
])

export const serverEventEnvelopeV1Schema = z.strictObject({
  version: z.literal(PROTOCOL_VERSION),
  roomCode: roomCodeSchema,
  roomSeq: sequenceSchema,
  serverTimeMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  event: serverEventSchema,
})

export type AckServerEvent = z.infer<typeof ackServerEventSchema>
export type SnapshotServerEvent = z.infer<typeof snapshotServerEventSchema>
export type DomainServerEvent = z.infer<typeof domainServerEventSchema>
export type ProtocolErrorCode = z.infer<typeof protocolErrorCodeSchema>
export type ErrorServerEvent = z.infer<typeof errorServerEventSchema>
export type ServerEvent = z.infer<typeof serverEventSchema>
export type ServerEventEnvelopeV1 = z.infer<typeof serverEventEnvelopeV1Schema>

export function parseServerEventEnvelopeV1(
  input: unknown,
): ServerEventEnvelopeV1 {
  return serverEventEnvelopeV1Schema.parse(input)
}
