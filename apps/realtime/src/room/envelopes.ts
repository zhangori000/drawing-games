import type { DrawingAction, DrawingDocument } from '@drawing-games/drawing-model';
import type { GuessVerdict, RoomView, TeamId } from '@drawing-games/game-core';
import { PROTOCOL_VERSION, ROOM_DOMAIN_EVENT_NAMES, commandIdSchema, type ProtocolErrorCode } from '@drawing-games/protocol';

import { MAX_MESSAGE_BYTES } from './constants';

/**
 * Server → client messages. Shapes mirror `serverEventEnvelopeV1Schema` and
 * the `room-events` payload schemas (tests parse every message with them);
 * they are typed here with the room's readonly domain types.
 */
export type DomainMessage =
	| {
			readonly name: typeof ROOM_DOMAIN_EVENT_NAMES.sessionIssued;
			/** SECURITY: carries a resume token. Send to its own socket only. */
			readonly payload: { readonly memberId: string; readonly resumeToken: string };
	  }
	| {
			readonly name: typeof ROOM_DOMAIN_EVENT_NAMES.canvasSnapshot;
			readonly payload: { readonly canvasId: string; readonly team: TeamId; readonly document: DrawingDocument };
	  }
	| {
			readonly name: typeof ROOM_DOMAIN_EVENT_NAMES.canvasOps;
			readonly payload: { readonly canvasId: string; readonly team: TeamId; readonly ops: readonly DrawingAction[] };
	  }
	| {
			readonly name: typeof ROOM_DOMAIN_EVENT_NAMES.canvasPreview;
			readonly payload: {
				readonly canvasId: string;
				readonly team: TeamId;
				readonly cols: number;
				readonly rows: number;
				readonly cells: readonly (string | null)[];
			};
	  }
	| {
			readonly name: typeof ROOM_DOMAIN_EVENT_NAMES.guessFeedback;
			readonly payload: { readonly text: string; readonly verdict: GuessVerdict };
	  };

export interface ErrorEvent {
	readonly type: 'protocol.error';
	readonly code: ProtocolErrorCode;
	readonly message: string;
	readonly retryable: boolean;
	readonly commandId?: string;
	/** `RATE_LIMITED` only (`rateLimitDetailsSchema`). */
	readonly details?: { readonly retryAfterMs: number };
}

export type OutgoingEvent =
	| {
			readonly type: 'command.ack';
			readonly commandId: string;
			readonly clientSeq: number;
			readonly status: 'applied' | 'duplicate';
	  }
	| { readonly type: 'room.snapshot'; readonly state: RoomView }
	| ({ readonly type: 'domain.event' } & DomainMessage)
	| ErrorEvent;

export function encodeEnvelope(roomCode: string, roomSeq: number, event: OutgoingEvent): string {
	return JSON.stringify({ version: PROTOCOL_VERSION, roomCode, roomSeq, serverTimeMs: Date.now(), event });
}

export function domainEvent(message: DomainMessage): OutgoingEvent {
	return { type: 'domain.event', ...message };
}

export function errorEvent(code: ProtocolErrorCode, message: string, commandId?: string, retryable = false): ErrorEvent {
	return commandId === undefined
		? { type: 'protocol.error', code, message, retryable }
		: { type: 'protocol.error', code, message, retryable, commandId };
}

/**
 * A command refused by the room's command budget. It was not applied (nor
 * recorded), so the client may resend it unchanged after `retryAfterMs`.
 */
export function rateLimitedEvent(commandId: string | undefined, retryAfterMs: number): ErrorEvent {
	return {
		...errorEvent('RATE_LIMITED', 'Too many actions at once. Wait a moment and try again.', commandId, true),
		details: { retryAfterMs },
	};
}

export class MessageTooLargeError extends Error {
	constructor() {
		super('Message exceeds the maximum size');
		this.name = 'MessageTooLargeError';
	}
}

/** UTF-8 JSON with a byte cap. Throws MessageTooLargeError or SyntaxError. */
export function decodeClientMessage(message: string | ArrayBuffer): unknown {
	if (typeof message === 'string') {
		// Cheap pre-check: UTF-8 is at least one byte per UTF-16 code unit.
		if (message.length > MAX_MESSAGE_BYTES || new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES) {
			throw new MessageTooLargeError();
		}
		return JSON.parse(message) as unknown;
	}
	if (message.byteLength > MAX_MESSAGE_BYTES) throw new MessageTooLargeError();
	let text: string;
	try {
		text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(message);
	} catch {
		throw new SyntaxError('Message is not valid UTF-8');
	}
	return JSON.parse(text) as unknown;
}

/** The commandId of a malformed envelope, when it has a usable one. */
export function readCommandId(raw: unknown): string | undefined {
	if (typeof raw !== 'object' || raw === null || !('commandId' in raw)) return undefined;
	const parsed = commandIdSchema.safeParse(raw.commandId);
	return parsed.success ? parsed.data : undefined;
}
