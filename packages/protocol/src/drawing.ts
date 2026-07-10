import {
  HEX_COLOR_PATTERN,
  MAX_STROKE_WIDTH,
  MIN_STROKE_WIDTH,
  type DrawingAction,
  type NormalizedPoint,
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

export type { DrawingAction, NormalizedPoint, StrokeStyle }
