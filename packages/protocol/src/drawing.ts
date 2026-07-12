import {
  HEX_COLOR_PATTERN,
  MAX_STROKE_WIDTH,
  MIN_STROKE_WIDTH,
  type DrawingAction,
  type DrawingDocument,
  type NormalizedPoint,
  type Stroke,
  type StrokeStyle,
} from '@drawing-games/drawing-model'
import { z } from 'zod'

import { strokeIdSchema } from './shared'

export const MAX_POINTS_PER_APPEND = 128
export const MAX_DRAWING_OPERATIONS_PER_BATCH = 32

export const normalizedPointSchema: z.ZodType<NormalizedPoint> = z.strictObject(
  {
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    pressure: z.number().finite().min(0).max(1).optional(),
  },
)

export const strokeStyleSchema: z.ZodType<StrokeStyle> = z.strictObject({
  color: z.string().regex(HEX_COLOR_PATTERN),
  width: z.number().finite().min(MIN_STROKE_WIDTH).max(MAX_STROKE_WIDTH),
  opacity: z.number().finite().min(0).max(1),
})

export const strokeSchema: z.ZodType<Stroke> = z.strictObject({
  id: strokeIdSchema,
  style: strokeStyleSchema,
  points: z.array(normalizedPointSchema).min(1),
})

/** Public editing capabilities derived from server-private drawing history. */
export const drawingHistoryCapabilitiesSchema = z.strictObject({
  canUndo: z.boolean(),
  canRedo: z.boolean(),
})

/**
 * A completed, history-free drawing snapshot. Every record key must match its
 * stroke ID, and strokeOrder must reference every stroke exactly once.
 */
export const drawingDocumentSchema: z.ZodType<DrawingDocument> = z
  .strictObject({
    strokesById: z.record(strokeIdSchema, strokeSchema),
    strokeOrder: z.array(strokeIdSchema),
  })
  .superRefine((document, context) => {
    const orderedIds = new Set<string>()

    document.strokeOrder.forEach((strokeId, index) => {
      if (orderedIds.has(strokeId)) {
        context.addIssue({
          code: 'custom',
          message: 'strokeOrder cannot contain duplicate stroke IDs',
          path: ['strokeOrder', index],
        })
      }
      orderedIds.add(strokeId)

      if (
        !Object.prototype.hasOwnProperty.call(document.strokesById, strokeId)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'strokeOrder references a missing stroke',
          path: ['strokeOrder', index],
        })
      }
    })

    for (const [recordId, stroke] of Object.entries(document.strokesById)) {
      if (stroke.id !== recordId) {
        context.addIssue({
          code: 'custom',
          message: 'Stroke record key must match stroke.id',
          path: ['strokesById', recordId, 'id'],
        })
      }

      if (!orderedIds.has(recordId)) {
        context.addIssue({
          code: 'custom',
          message: 'Every stroke must appear in strokeOrder',
          path: ['strokesById', recordId],
        })
      }
    }
  })

const beginStrokeSchema = z.strictObject({
  type: z.literal('stroke.begin'),
  strokeId: strokeIdSchema,
  point: normalizedPointSchema,
  style: strokeStyleSchema,
})

const appendStrokeSchema = z.strictObject({
  type: z.literal('stroke.append'),
  strokeId: strokeIdSchema,
  startPointIndex: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  points: z.array(normalizedPointSchema).min(1).max(MAX_POINTS_PER_APPEND),
})

const endStrokeSchema = z.strictObject({
  type: z.literal('stroke.end'),
  strokeId: strokeIdSchema,
  pointCount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
})

const deleteStrokeSchema = z.strictObject({
  type: z.literal('stroke.delete'),
  strokeId: strokeIdSchema,
})

const clearDrawingSchema = z.strictObject({
  type: z.literal('drawing.clear'),
})

const undoDrawingSchema = z.strictObject({
  type: z.literal('drawing.undo'),
})

const redoDrawingSchema = z.strictObject({
  type: z.literal('drawing.redo'),
})

export const drawingOperationSchema: z.ZodType<DrawingAction> =
  z.discriminatedUnion('type', [
    beginStrokeSchema,
    appendStrokeSchema,
    endStrokeSchema,
    deleteStrokeSchema,
    clearDrawingSchema,
    undoDrawingSchema,
    redoDrawingSchema,
  ])

export type DrawingOperation = z.infer<typeof drawingOperationSchema>
export type DrawingHistoryCapabilities = z.infer<
  typeof drawingHistoryCapabilitiesSchema
>

export type { DrawingAction, NormalizedPoint, StrokeStyle }
