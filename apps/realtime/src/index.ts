import {
	PROTOCOL_VERSION,
	parseCommandEnvelopeV1,
	roomCodeSchema,
	sessionIdSchema,
	type AckServerEvent,
	type CommandEnvelopeV1,
	type ErrorServerEvent,
	type ServerEvent,
	type ServerEventEnvelopeV1,
} from '@drawing-games/protocol';
import { DurableObject } from 'cloudflare:workers';

export interface Env {
	GAME_ROOM: DurableObjectNamespace<GameRoom>;
}

interface ConnectionAttachment {
	readonly version: 1;
	readonly roomCode: string;
	readonly sessionId: string;
}

interface StoredCommand {
	readonly sessionId: string;
	readonly clientSeq: number;
	readonly signature: string;
	readonly appliedAck: ServerEventEnvelopeV1;
}

interface StoredDeadline {
	readonly atMs: number;
	readonly token: string;
}

type CommandCommit =
	| { readonly kind: 'applied'; readonly envelope: ServerEventEnvelopeV1 }
	| { readonly kind: 'duplicate'; readonly envelope: ServerEventEnvelopeV1 }
	| { readonly kind: 'conflict' };

const ROOM_SEQUENCE_KEY = 'roomSeq';
const NEXT_DEADLINE_KEY = 'nextDeadline';
const COMMAND_KEY_PREFIX = 'commands/';
const MAX_COMMAND_BYTES = 512 * 1024;
const ROOM_SOCKET_ROUTE = /^\/rooms\/([^/]+)\/socket$/;

export class GameRoom extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== 'GET') {
			return methodNotAllowed('GET');
		}

		if (!isWebSocketUpgrade(request)) {
			return upgradeRequired();
		}

		const url = new URL(request.url);
		const roomCodeResult = roomCodeSchema.safeParse(url.searchParams.get('roomCode'));
		const sessionIdResult = sessionIdSchema.safeParse(url.searchParams.get('sessionId'));

		if (!roomCodeResult.success || !sessionIdResult.success) {
			return jsonResponse({ error: 'Invalid room or session identity' }, 400);
		}

		const roomCode = roomCodeResult.data;
		const sessionId = sessionIdResult.data;
		const [client, server] = Object.values(new WebSocketPair());
		const attachment: ConnectionAttachment = {
			version: PROTOCOL_VERSION,
			roomCode,
			sessionId,
		};

		this.ctx.acceptWebSocket(server);
		server.serializeAttachment(attachment);

		const roomSeq = await this.getRoomSequence();
		const snapshot = createServerEnvelope(roomCode, roomSeq, {
			type: 'room.snapshot',
			// This public projection is intentionally role-neutral. Secret words and
			// team-specific state must never be added to this transport snapshot.
			state: { phase: 'lobby' },
		});
		safeSend(server, snapshot);

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		const attachment = readAttachment(ws);

		if (attachment === null) {
			safeClose(ws, 1011, 'Invalid connection state');
			return;
		}

		try {
			const parsedMessage = decodeClientMessage(message);
			const envelope = parseCommandEnvelopeV1(parsedMessage);

			if (envelope.roomCode !== attachment.roomCode || envelope.sessionId !== attachment.sessionId) {
				await this.sendProtocolError(ws, attachment.roomCode, {
					type: 'protocol.error',
					code: 'UNAUTHORIZED',
					message: 'Command identity does not match this connection',
					retryable: false,
					commandId: envelope.commandId,
				});
				return;
			}

			const commit = await this.commitCommand(envelope);

			switch (commit.kind) {
				case 'applied':
					// The transaction has committed the sequence and ack before any
					// connected client can observe this broadcast.
					this.broadcast(commit.envelope);
					return;
				case 'duplicate':
					// A duplicate is a response to the retrying connection, not a new
					// room event, so it keeps the original room sequence.
					safeSend(ws, commit.envelope);
					return;
				case 'conflict':
					await this.sendProtocolError(ws, attachment.roomCode, {
						type: 'protocol.error',
						code: 'BAD_COMMAND',
						message: 'commandId was already used by another command',
						retryable: false,
						commandId: envelope.commandId,
					});
					return;
			}
		} catch (error) {
			if (error instanceof MessageTooLargeError) {
				await this.sendProtocolError(ws, attachment.roomCode, {
					type: 'protocol.error',
					code: 'BAD_COMMAND',
					message: 'Command exceeds the maximum message size',
					retryable: false,
				});
				safeClose(ws, 1009, 'Message too large');
				return;
			}

			if (error instanceof SyntaxError || isProtocolValidationError(error)) {
				await this.sendProtocolError(ws, attachment.roomCode, {
					type: 'protocol.error',
					code: 'BAD_COMMAND',
					message: 'Command is not a valid protocol v1 envelope',
					retryable: false,
				});
				return;
			}

			console.error('GameRoom failed to process a command', error);
			await this.sendProtocolError(ws, attachment.roomCode, {
				type: 'protocol.error',
				code: 'INTERNAL',
				message: 'The room could not process this command',
				retryable: true,
			});
		}
	}

	webSocketError(ws: WebSocket): void {
		safeClose(ws, 1011, 'WebSocket error');
	}

	webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
		// The runtime completes the close handshake for this compatibility date.
		// Membership is session-based and durable, so a transport close is not a
		// leave-game command.
	}

	async alarm(): Promise<void> {
		const deadline = await this.ctx.storage.get<StoredDeadline>(NEXT_DEADLINE_KEY);

		if (deadline === undefined || !isStoredDeadline(deadline)) {
			return;
		}

		if (deadline.atMs > Date.now()) {
			// An early or manually invoked alarm is harmless and reuses the stored
			// absolute server deadline rather than calculating a relative delay.
			await this.ctx.storage.setAlarm(deadline.atMs);
			return;
		}

		// TODO(game-state): atomically compare this exact token, apply the timed
		// phase transition, persist its public event, and replace/delete the
		// deadline in one storage transaction. Until that reducer exists, the
		// transport layer deliberately performs no non-idempotent alarm work.
	}

	private async commitCommand(envelope: CommandEnvelopeV1): Promise<CommandCommit> {
		const commandKey = `${COMMAND_KEY_PREFIX}${envelope.commandId}`;
		const signature = commandSignature(envelope);

		return this.ctx.storage.transaction(async (transaction) => {
			const existing = await transaction.get<StoredCommand>(commandKey);

			if (existing !== undefined) {
				if (existing.sessionId !== envelope.sessionId || existing.clientSeq !== envelope.clientSeq || existing.signature !== signature) {
					return { kind: 'conflict' };
				}

				const duplicateEvent: AckServerEvent = {
					type: 'command.ack',
					commandId: envelope.commandId,
					clientSeq: envelope.clientSeq,
					status: 'duplicate',
				};

				return {
					kind: 'duplicate',
					envelope: {
						...existing.appliedAck,
						serverTimeMs: Date.now(),
						event: duplicateEvent,
					},
				};
			}

			const currentRoomSeq = normalizeStoredSequence(await transaction.get<number>(ROOM_SEQUENCE_KEY));

			if (currentRoomSeq === Number.MAX_SAFE_INTEGER) {
				throw new Error('Room sequence exhausted');
			}

			const nextRoomSeq = currentRoomSeq + 1;
			const appliedAck = createServerEnvelope(envelope.roomCode, nextRoomSeq, {
				type: 'command.ack',
				commandId: envelope.commandId,
				clientSeq: envelope.clientSeq,
				status: 'applied',
			});
			const stored: StoredCommand = {
				sessionId: envelope.sessionId,
				clientSeq: envelope.clientSeq,
				signature,
				appliedAck,
			};

			await transaction.put(ROOM_SEQUENCE_KEY, nextRoomSeq);
			await transaction.put(commandKey, stored);

			return { kind: 'applied', envelope: appliedAck };
		});
	}

	private async getRoomSequence(): Promise<number> {
		return normalizeStoredSequence(await this.ctx.storage.get<number>(ROOM_SEQUENCE_KEY));
	}

	private async sendProtocolError(ws: WebSocket, roomCode: string, event: ErrorServerEvent): Promise<void> {
		const roomSeq = await this.getRoomSequence();
		safeSend(ws, createServerEnvelope(roomCode, roomSeq, event));
	}

	private broadcast(envelope: ServerEventEnvelopeV1): void {
		for (const socket of this.ctx.getWebSockets()) {
			safeSend(socket, envelope);
		}
	}
}

const worker = {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/health') {
			if (request.method !== 'GET') {
				return methodNotAllowed('GET');
			}

			return jsonResponse({ status: 'ok' }, 200, { 'Cache-Control': 'no-store' });
		}

		const routeMatch = ROOM_SOCKET_ROUTE.exec(url.pathname);

		if (routeMatch === null) {
			return jsonResponse({ error: 'Not found' }, 404);
		}

		if (request.method !== 'GET') {
			return methodNotAllowed('GET');
		}

		if (!isWebSocketUpgrade(request)) {
			return upgradeRequired();
		}

		const roomCode = normalizeRoomCode(routeMatch[1] ?? '');
		const sessionIdResult = sessionIdSchema.safeParse(url.searchParams.get('sessionId'));

		if (roomCode === null || !sessionIdResult.success || url.searchParams.getAll('sessionId').length !== 1) {
			return jsonResponse({ error: 'Invalid room code or sessionId' }, 400);
		}

		const internalUrl = new URL('https://game-room.internal/socket');
		internalUrl.searchParams.set('roomCode', roomCode);
		internalUrl.searchParams.set('sessionId', sessionIdResult.data);
		const stub = env.GAME_ROOM.getByName(roomCode);

		return stub.fetch(
			new Request(internalUrl, {
				method: 'GET',
				headers: request.headers,
			}),
		);
	},
} satisfies ExportedHandler<Env>;

export default worker;

export function normalizeRoomCode(rawRoomCode: string): string | null {
	let decoded: string;

	try {
		decoded = decodeURIComponent(rawRoomCode);
	} catch {
		return null;
	}

	const normalized = decoded.trim().toUpperCase();
	const result = roomCodeSchema.safeParse(normalized);
	return result.success ? result.data : null;
}

function createServerEnvelope(roomCode: string, roomSeq: number, event: ServerEvent): ServerEventEnvelopeV1 {
	return {
		version: PROTOCOL_VERSION,
		roomCode,
		roomSeq,
		serverTimeMs: Date.now(),
		event,
	};
}

function decodeClientMessage(message: string | ArrayBuffer): unknown {
	if (typeof message === 'string') {
		if (new TextEncoder().encode(message).byteLength > MAX_COMMAND_BYTES) {
			throw new MessageTooLargeError();
		}

		return JSON.parse(message) as unknown;
	}

	if (message.byteLength > MAX_COMMAND_BYTES) {
		throw new MessageTooLargeError();
	}

	let text: string;

	try {
		text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(message);
	} catch {
		throw new SyntaxError('Command is not valid UTF-8');
	}

	return JSON.parse(text) as unknown;
}

function commandSignature(envelope: CommandEnvelopeV1): string {
	// Zod returns command objects in schema order, so this semantic projection is
	// deterministic while excluding retry metadata such as lastRoomSeq.
	return JSON.stringify({
		sessionId: envelope.sessionId,
		roomCode: envelope.roomCode,
		clientSeq: envelope.clientSeq,
		command: envelope.command,
	});
}

function readAttachment(ws: WebSocket): ConnectionAttachment | null {
	const value = ws.deserializeAttachment();

	if (typeof value !== 'object' || value === null) {
		return null;
	}

	const attachment = value as Partial<ConnectionAttachment>;
	const roomCode = roomCodeSchema.safeParse(attachment.roomCode);
	const sessionId = sessionIdSchema.safeParse(attachment.sessionId);

	if (attachment.version !== PROTOCOL_VERSION || !roomCode.success || !sessionId.success) {
		return null;
	}

	return {
		version: PROTOCOL_VERSION,
		roomCode: roomCode.data,
		sessionId: sessionId.data,
	};
}

function safeSend(ws: WebSocket, envelope: ServerEventEnvelopeV1): void {
	try {
		ws.send(JSON.stringify(envelope));
	} catch {
		safeClose(ws, 1011, 'Send failed');
	}
}

function safeClose(ws: WebSocket, code: number, reason: string): void {
	try {
		ws.close(code, reason);
	} catch {
		// The peer may already be disconnected.
	}
}

function isWebSocketUpgrade(request: Request): boolean {
	return request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
}

function isProtocolValidationError(error: unknown): boolean {
	return typeof error === 'object' && error !== null && 'name' in error && (error as { name?: unknown }).name === 'ZodError';
}

function normalizeStoredSequence(value: number | undefined): number {
	if (value === undefined) {
		return 0;
	}

	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error('Stored room sequence is invalid');
	}

	return value;
}

function isStoredDeadline(value: StoredDeadline): boolean {
	return Number.isSafeInteger(value.atMs) && value.atMs >= 0 && value.token.length > 0;
}

function jsonResponse(body: unknown, status: number, headers?: HeadersInit): Response {
	const responseHeaders = new Headers(headers);
	responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
	return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function methodNotAllowed(allowedMethod: string): Response {
	return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: allowedMethod });
}

function upgradeRequired(): Response {
	return jsonResponse({ error: 'WebSocket upgrade required' }, 426, { Upgrade: 'websocket' });
}

class MessageTooLargeError extends Error {}
