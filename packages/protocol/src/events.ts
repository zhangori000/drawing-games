import { z } from 'zod'

import {
  drawingDocumentSchema,
  drawingHistoryCapabilitiesSchema,
} from './drawing'
import {
  PROTOCOL_VERSION,
  commandIdSchema,
  roomCodeSchema,
  sequenceSchema,
  teamIdSchema,
} from './shared'
import {
  awaitingJoinSnapshotSchema,
  drawingRoomSnapshotSchema,
} from './snapshots'

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

export const awaitingJoinSnapshotServerEventSchema = z.strictObject({
  type: z.literal('room.snapshot'),
  state: awaitingJoinSnapshotSchema,
})

export const drawingRoomSnapshotServerEventSchema = z.strictObject({
  type: z.literal('room.snapshot'),
  state: drawingRoomSnapshotSchema,
})

export const typedRoomSnapshotServerEventSchema = z.union([
  awaitingJoinSnapshotServerEventSchema,
  drawingRoomSnapshotServerEventSchema,
])

/** Public domain events are named and versioned by the enclosing protocol. */
export const domainServerEventSchema = z.strictObject({
  type: z.literal('domain.event'),
  name: domainEventNameSchema,
  payload: z.json(),
})

export const AUTHORITATIVE_DRAWING_DOCUMENT_EVENT_NAME =
  'drawing.document' as const
export const OPPONENT_DRAWING_ACTIVITY_EVENT_NAME =
  'drawing.opponent-activity' as const

/** This payload is authoritative and may be fanned out only to its own team. */
export const authoritativeDrawingDocumentEventPayloadSchema = z.strictObject({
  team: teamIdSchema,
  document: drawingDocumentSchema,
  ...drawingHistoryCapabilitiesSchema.shape,
})

/** Coarse cross-team signal that deliberately contains no opponent vectors. */
export const opponentDrawingActivityEventPayloadSchema = z.strictObject({
  team: teamIdSchema,
  active: z.literal(true),
})

export const authoritativeDrawingDocumentDomainEventSchema = z.strictObject({
  type: z.literal('domain.event'),
  name: z.literal(AUTHORITATIVE_DRAWING_DOCUMENT_EVENT_NAME),
  payload: authoritativeDrawingDocumentEventPayloadSchema,
})

export const opponentDrawingActivityDomainEventSchema = z.strictObject({
  type: z.literal('domain.event'),
  name: z.literal(OPPONENT_DRAWING_ACTIVITY_EVENT_NAME),
  payload: opponentDrawingActivityEventPayloadSchema,
})

export const drawingDomainEventSchema = z.discriminatedUnion('name', [
  authoritativeDrawingDocumentDomainEventSchema,
  opponentDrawingActivityDomainEventSchema,
])

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
export type AwaitingJoinSnapshotServerEvent = z.infer<
  typeof awaitingJoinSnapshotServerEventSchema
>
export type DrawingRoomSnapshotServerEvent = z.infer<
  typeof drawingRoomSnapshotServerEventSchema
>
export type TypedRoomSnapshotServerEvent = z.infer<
  typeof typedRoomSnapshotServerEventSchema
>
export type DomainServerEvent = z.infer<typeof domainServerEventSchema>
export type AuthoritativeDrawingDocumentEventPayload = z.infer<
  typeof authoritativeDrawingDocumentEventPayloadSchema
>
export type OpponentDrawingActivityEventPayload = z.infer<
  typeof opponentDrawingActivityEventPayloadSchema
>
export type AuthoritativeDrawingDocumentDomainEvent = z.infer<
  typeof authoritativeDrawingDocumentDomainEventSchema
>
export type OpponentDrawingActivityDomainEvent = z.infer<
  typeof opponentDrawingActivityDomainEventSchema
>
export type DrawingDomainEvent = z.infer<typeof drawingDomainEventSchema>
export type ProtocolErrorCode = z.infer<typeof protocolErrorCodeSchema>
export type ErrorServerEvent = z.infer<typeof errorServerEventSchema>
export type ServerEvent = z.infer<typeof serverEventSchema>
export type ServerEventEnvelopeV1 = z.infer<typeof serverEventEnvelopeV1Schema>

export function parseServerEventEnvelopeV1(
  input: unknown,
): ServerEventEnvelopeV1 {
  return serverEventEnvelopeV1Schema.parse(input)
}

export function parseDrawingDomainEvent(input: unknown): DrawingDomainEvent {
  return drawingDomainEventSchema.parse(input)
}
