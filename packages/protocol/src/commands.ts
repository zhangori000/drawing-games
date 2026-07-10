import { z } from 'zod'

import {
  MAX_DRAWING_OPERATIONS_PER_BATCH,
  drawingOperationSchema,
} from './drawing'
import {
  PROTOCOL_VERSION,
  commandIdSchema,
  roomCodeSchema,
  sequenceSchema,
  sessionIdSchema,
} from './shared'

const optionIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/)

export const resumeCommandSchema = z.strictObject({
  type: z.literal('room.resume'),
})

export const joinCommandSchema = z.strictObject({
  type: z.literal('room.join'),
  displayName: z.string().trim().min(1).max(32),
})

export const draftSelectCommandSchema = z.strictObject({
  type: z.literal('draft.select'),
  optionId: optionIdSchema,
})

export const draftSeenCommandSchema = z.strictObject({
  type: z.literal('draft.seen'),
  optionId: optionIdSchema,
})

export const guessCommandSchema = z.strictObject({
  type: z.literal('guess.submit'),
  text: z.string().trim().min(1).max(120),
})

export const hintCommandSchema = z.strictObject({
  type: z.literal('hint.vote'),
  hint: z.literal('word-length'),
  approve: z.boolean(),
})

export const drawingBatchCommandSchema = z.strictObject({
  type: z.literal('drawing.batch'),
  operations: z
    .array(drawingOperationSchema)
    .min(1)
    .max(MAX_DRAWING_OPERATIONS_PER_BATCH),
})

export const surrenderCommandSchema = z.strictObject({
  type: z.literal('surrender.vote'),
  approve: z.boolean(),
})

export const rematchCommandSchema = z.strictObject({
  type: z.literal('rematch.vote'),
  mode: z.enum(['same-settings', 'change-settings', 'decline']),
})

export const clientCommandSchema = z.discriminatedUnion('type', [
  resumeCommandSchema,
  joinCommandSchema,
  draftSelectCommandSchema,
  draftSeenCommandSchema,
  guessCommandSchema,
  hintCommandSchema,
  drawingBatchCommandSchema,
  surrenderCommandSchema,
  rematchCommandSchema,
])

export const commandEnvelopeV1Schema = z.strictObject({
  version: z.literal(PROTOCOL_VERSION),
  commandId: commandIdSchema,
  sessionId: sessionIdSchema,
  roomCode: roomCodeSchema,
  clientSeq: sequenceSchema.refine((value) => value > 0, {
    message: 'clientSeq must start at 1',
  }),
  lastRoomSeq: sequenceSchema,
  command: clientCommandSchema,
})

export type ResumeCommand = z.infer<typeof resumeCommandSchema>
export type JoinCommand = z.infer<typeof joinCommandSchema>
export type DraftSelectCommand = z.infer<typeof draftSelectCommandSchema>
export type DraftSeenCommand = z.infer<typeof draftSeenCommandSchema>
export type GuessCommand = z.infer<typeof guessCommandSchema>
export type HintCommand = z.infer<typeof hintCommandSchema>
export type DrawingBatchCommand = z.infer<typeof drawingBatchCommandSchema>
export type SurrenderCommand = z.infer<typeof surrenderCommandSchema>
export type RematchCommand = z.infer<typeof rematchCommandSchema>
export type ClientCommand = z.infer<typeof clientCommandSchema>
export type CommandEnvelopeV1 = z.infer<typeof commandEnvelopeV1Schema>

export function parseCommandEnvelopeV1(input: unknown): CommandEnvelopeV1 {
  return commandEnvelopeV1Schema.parse(input)
}
