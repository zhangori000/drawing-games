import {
  ROOM_DOMAIN_EVENT_NAMES,
  canvasOpsPayloadSchema,
  canvasPreviewPayloadSchema,
  canvasSnapshotPayloadSchema,
  guessFeedbackPayloadSchema,
  sessionIssuedPayloadSchema,
  type CanvasOpsPayload,
  type CanvasPreviewPayload,
  type CanvasSnapshotPayload,
  type GuessFeedbackPayload,
  type SessionIssuedPayload,
} from '@drawing-games/protocol'

export type DecodedDomainEvent =
  | { readonly type: 'session.issued'; readonly payload: SessionIssuedPayload }
  | {
      readonly type: 'canvas.snapshot'
      readonly payload: CanvasSnapshotPayload
    }
  | { readonly type: 'canvas.ops'; readonly payload: CanvasOpsPayload }
  | { readonly type: 'canvas.preview'; readonly payload: CanvasPreviewPayload }
  | { readonly type: 'guess.feedback'; readonly payload: GuessFeedbackPayload }

/**
 * Validates a `domain.event` payload against its protocol schema. Unknown
 * names and invalid payloads return null and are ignored, so a newer server
 * can add events without breaking older tabs.
 */
export function decodeDomainEvent(
  name: string,
  payload: unknown,
): DecodedDomainEvent | null {
  switch (name) {
    case ROOM_DOMAIN_EVENT_NAMES.sessionIssued: {
      const parsed = sessionIssuedPayloadSchema.safeParse(payload)
      return parsed.success
        ? { type: 'session.issued', payload: parsed.data }
        : null
    }
    case ROOM_DOMAIN_EVENT_NAMES.canvasSnapshot: {
      const parsed = canvasSnapshotPayloadSchema.safeParse(payload)
      return parsed.success
        ? { type: 'canvas.snapshot', payload: parsed.data }
        : null
    }
    case ROOM_DOMAIN_EVENT_NAMES.canvasOps: {
      const parsed = canvasOpsPayloadSchema.safeParse(payload)
      return parsed.success
        ? { type: 'canvas.ops', payload: parsed.data }
        : null
    }
    case ROOM_DOMAIN_EVENT_NAMES.canvasPreview: {
      const parsed = canvasPreviewPayloadSchema.safeParse(payload)
      return parsed.success
        ? { type: 'canvas.preview', payload: parsed.data }
        : null
    }
    case ROOM_DOMAIN_EVENT_NAMES.guessFeedback: {
      const parsed = guessFeedbackPayloadSchema.safeParse(payload)
      return parsed.success
        ? { type: 'guess.feedback', payload: parsed.data }
        : null
    }
    default:
      return null
  }
}
