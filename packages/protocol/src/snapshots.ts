import { z } from 'zod'

import {
  drawingDocumentSchema,
  drawingHistoryCapabilitiesSchema,
} from './drawing'
import { playerIdSchema, teamIdSchema } from './shared'

export const drawingRoomViewerSchema = z.strictObject({
  playerId: playerIdSchema,
  team: teamIdSchema,
  role: z.enum(['drawer', 'guesser']),
})

/** Sent before this room-scoped session has joined the room membership. */
export const awaitingJoinSnapshotSchema = z.strictObject({
  kind: z.literal('awaiting-join'),
})

/**
 * Audience-scoped snapshot. teamDrawing is always the viewer team's document;
 * an opponent DrawingDocument is intentionally not part of this wire shape.
 */
export const drawingRoomSnapshotSchema = z.strictObject({
  kind: z.literal('drawing-room'),
  phase: z.literal('drawing'),
  viewer: drawingRoomViewerSchema,
  teamDrawing: drawingDocumentSchema,
  ...drawingHistoryCapabilitiesSchema.shape,
})

export const roomSnapshotStateSchema = z.discriminatedUnion('kind', [
  awaitingJoinSnapshotSchema,
  drawingRoomSnapshotSchema,
])

export type DrawingRoomViewer = z.infer<typeof drawingRoomViewerSchema>
export type AwaitingJoinSnapshot = z.infer<typeof awaitingJoinSnapshotSchema>
export type DrawingRoomSnapshot = z.infer<typeof drawingRoomSnapshotSchema>
export type RoomSnapshotState = z.infer<typeof roomSnapshotStateSchema>

export function parseRoomSnapshotState(input: unknown): RoomSnapshotState {
  return roomSnapshotStateSchema.parse(input)
}
