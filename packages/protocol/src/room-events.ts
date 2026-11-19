import { z } from 'zod'

import {
  drawingOperationSchema,
  normalizedPointSchema,
  strokeStyleSchema,
} from './drawing'
import { strokeIdSchema } from './shared'

/**
 * Payloads carried by `domain.event` envelopes from the room. The full
 * per-viewer room projection travels separately as `room.snapshot`
 * (`state` = game-core `RoomView`).
 */
export const ROOM_DOMAIN_EVENT_NAMES = Object.freeze({
  sessionIssued: 'session.issued',
  canvasSnapshot: 'canvas.snapshot',
  canvasOps: 'canvas.ops',
  canvasPreview: 'canvas.preview',
  guessFeedback: 'guess.feedback',
} as const)

const canvasIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/)

const teamSchema = z.enum(['A', 'B'])

/** Sent privately to one socket after a successful join or resume. */
export const sessionIssuedPayloadSchema = z.strictObject({
  memberId: z.string().min(1).max(64),
  /** Opaque secret. Store per room; never log or display it. */
  resumeToken: z.string().min(16).max(256),
})

export const drawingDocumentSchema = z.strictObject({
  strokesById: z.record(
    strokeIdSchema,
    z.strictObject({
      id: strokeIdSchema,
      style: strokeStyleSchema,
      points: z.array(normalizedPointSchema).min(1),
    }),
  ),
  strokeOrder: z.array(strokeIdSchema),
})

/** Authoritative full canvas: replace local state for this canvas. */
export const canvasSnapshotPayloadSchema = z.strictObject({
  canvasId: canvasIdSchema,
  team: teamSchema,
  document: drawingDocumentSchema,
})

/** Ordered operations to apply on top of the latest snapshot. */
export const canvasOpsPayloadSchema = z.strictObject({
  canvasId: canvasIdSchema,
  team: teamSchema,
  ops: z.array(drawingOperationSchema).min(1).max(256),
})

/** Coarse, irreversible opponent preview grid (row-major cells). */
export const canvasPreviewPayloadSchema = z.strictObject({
  canvasId: canvasIdSchema,
  team: teamSchema,
  cols: z.number().int().min(1).max(64),
  rows: z.number().int().min(1).max(64),
  cells: z
    .array(
      z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .nullable(),
    )
    .max(4096),
})

/** Private verdict for the guesser who submitted `text`. */
export const guessFeedbackPayloadSchema = z.strictObject({
  text: z.string().max(120),
  verdict: z.enum(['correct', 'close', 'partial', 'wrong']),
})

export type SessionIssuedPayload = z.infer<typeof sessionIssuedPayloadSchema>
export type DrawingDocumentPayload = z.infer<typeof drawingDocumentSchema>
export type CanvasSnapshotPayload = z.infer<typeof canvasSnapshotPayloadSchema>
export type CanvasOpsPayload = z.infer<typeof canvasOpsPayloadSchema>
export type CanvasPreviewPayload = z.infer<typeof canvasPreviewPayloadSchema>
export type GuessFeedbackPayload = z.infer<typeof guessFeedbackPayloadSchema>
