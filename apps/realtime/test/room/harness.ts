import type { RoomView, TeamId } from '@drawing-games/game-core';
import {
	PROTOCOL_VERSION,
	ROOM_DOMAIN_EVENT_NAMES,
	canvasOpsPayloadSchema,
	canvasPreviewPayloadSchema,
	canvasSnapshotPayloadSchema,
	guessFeedbackPayloadSchema,
	parseServerEventEnvelopeV1,
	sessionIssuedPayloadSchema,
	type CanvasOpsPayload,
	type CanvasPreviewPayload,
	type CanvasSnapshotPayload,
	type ClientCommand,
	type ErrorServerEvent,
	type GuessFeedbackPayload,
	type ServerEventEnvelopeV1,
	type SessionIssuedPayload,
} from '@drawing-games/protocol';
import { exports as workerExports } from 'cloudflare:workers';
import { expect } from 'vitest';

export type Envelope = ServerEventEnvelopeV1;

const DEFAULT_TIMEOUT_MS = 4_000;

const PAYLOAD_SCHEMAS = {
	[ROOM_DOMAIN_EVENT_NAMES.sessionIssued]: sessionIssuedPayloadSchema,
	[ROOM_DOMAIN_EVENT_NAMES.canvasSnapshot]: canvasSnapshotPayloadSchema,
	[ROOM_DOMAIN_EVENT_NAMES.canvasOps]: canvasOpsPayloadSchema,
	[ROOM_DOMAIN_EVENT_NAMES.canvasPreview]: canvasPreviewPayloadSchema,
	[ROOM_DOMAIN_EVENT_NAMES.guessFeedback]: guessFeedbackPayloadSchema,
} as const;

interface PayloadByName {
	'session.issued': SessionIssuedPayload;
	'canvas.snapshot': CanvasSnapshotPayload;
	'canvas.ops': CanvasOpsPayload;
	'canvas.preview': CanvasPreviewPayload;
	'guess.feedback': GuessFeedbackPayload;
}

export function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
	return workerExports.default.fetch(new Request(`https://example.com${path}`, init));
}

export async function createRoom(): Promise<string> {
	const response = await fetchWorker('/rooms', { method: 'POST' });
	expect(response.status).toBe(201);
	const body = (await response.json()) as { roomCode: string };
	return body.roomCode;
}

export function randomSessionId(): string {
	return `s_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function randomCommandId(): string {
	return `c_${crypto.randomUUID().replace(/-/g, '')}`;
}

/**
 * A test client for one room socket. Every server message is validated
 * against the protocol schemas (envelope and domain payloads) and queued;
 * `next` takes the first queued message matching a predicate.
 */
export class RoomSocket {
	readonly closed: Promise<{ readonly code: number; readonly reason: string }>;
	memberId: string | null = null;
	resumeToken: string | null = null;
	private readonly inbox: Envelope[] = [];
	private readonly problems: string[] = [];
	private readonly listeners = new Set<() => void>();
	private clientSeq = 0;

	private constructor(
		readonly socket: WebSocket,
		readonly roomCode: string,
		readonly sessionId: string,
	) {
		this.closed = new Promise((resolve) => {
			socket.addEventListener('close', (event) => {
				resolve({ code: event.code, reason: event.reason });
				this.notify();
			});
		});
		socket.addEventListener('message', (event) => {
			this.receive(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data));
		});
	}

	static async open(roomCode: string, sessionId: string = randomSessionId()): Promise<RoomSocket> {
		const response = await fetchWorker(`/rooms/${roomCode}/socket?sessionId=${sessionId}`, { headers: { Upgrade: 'websocket' } });
		expect(response.status).toBe(101);
		const socket = response.webSocket;
		if (socket === null) throw new Error('Expected a WebSocket response');
		const client = new RoomSocket(socket, roomCode.toUpperCase(), sessionId);
		socket.accept();
		return client;
	}

	/** Sends a command envelope and returns its commandId. */
	send(command: ClientCommand, options: { readonly commandId?: string; readonly clientSeq?: number } = {}): string {
		const commandId = options.commandId ?? randomCommandId();
		const clientSeq = options.clientSeq ?? (this.clientSeq += 1);
		this.sendRaw(
			JSON.stringify({
				version: PROTOCOL_VERSION,
				commandId,
				sessionId: this.sessionId,
				roomCode: this.roomCode,
				clientSeq,
				lastRoomSeq: 0,
				command,
			}),
		);
		return commandId;
	}

	sendRaw(data: string): void {
		this.socket.send(data);
	}

	next(predicate: (envelope: Envelope) => boolean, label: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Envelope> {
		return new Promise((resolve, reject) => {
			const check = (): boolean => {
				if (this.problems.length > 0) {
					reject(new Error(`Invalid server message: ${this.problems.join('; ')}`));
					return true;
				}
				const index = this.inbox.findIndex(predicate);
				if (index === -1) return false;
				const [found] = this.inbox.splice(index, 1);
				resolve(found as Envelope);
				return true;
			};
			if (check()) return;
			const timer = setTimeout(() => {
				this.listeners.delete(listener);
				reject(new Error(`Timed out waiting for ${label}; queued: ${this.describeInbox()}`));
			}, timeoutMs);
			const listener = () => {
				if (!check()) return;
				clearTimeout(timer);
				this.listeners.delete(listener);
			};
			this.listeners.add(listener);
		});
	}

	async ack(commandId: string): Promise<Envelope & { event: { type: 'command.ack' } }> {
		const envelope = await this.next((e) => e.event.type === 'command.ack' && e.event.commandId === commandId, `ack ${commandId}`);
		return envelope as Envelope & { event: { type: 'command.ack' } };
	}

	async error(commandId?: string): Promise<ErrorServerEvent> {
		const envelope = await this.next(
			(e) => e.event.type === 'protocol.error' && (commandId === undefined || e.event.commandId === commandId),
			`error ${commandId ?? ''}`,
		);
		return envelope.event as ErrorServerEvent;
	}

	/** Next view satisfying `predicate`; earlier views stay queued unless they match. */
	async view(predicate: (view: RoomView) => boolean = () => true, label = 'view'): Promise<RoomView> {
		const envelope = await this.next((e) => e.event.type === 'room.snapshot' && predicate(e.event.state as unknown as RoomView), label);
		return (envelope.event as { state: unknown }).state as RoomView;
	}

	/** Drops queued views and returns the newest one received so far (waits if none). */
	async latestView(): Promise<RoomView> {
		let latest: RoomView | null = null;
		for (let index = this.inbox.length - 1; index >= 0; index -= 1) {
			const envelope = this.inbox[index] as Envelope;
			if (envelope.event.type !== 'room.snapshot') continue;
			latest ??= envelope.event.state as unknown as RoomView;
			this.inbox.splice(index, 1);
		}
		return latest ?? this.view();
	}

	async domain<N extends keyof PayloadByName>(
		name: N,
		predicate: (payload: PayloadByName[N]) => boolean = () => true,
	): Promise<PayloadByName[N]> {
		const envelope = await this.next(
			(e) => e.event.type === 'domain.event' && e.event.name === name && predicate(e.event.payload as unknown as PayloadByName[N]),
			name,
		);
		return (envelope.event as { payload: unknown }).payload as PayloadByName[N];
	}

	/** Whether any queued message matches (use after `barrier()` for negative checks). */
	has(predicate: (envelope: Envelope) => boolean): boolean {
		return this.inbox.some(predicate);
	}

	/** Whether any queued message is a `name` domain event matching `predicate`. */
	hasDomain<N extends keyof PayloadByName>(name: N, predicate: (payload: PayloadByName[N]) => boolean = () => true): boolean {
		return this.inbox.some(
			(e) => e.event.type === 'domain.event' && e.event.name === name && predicate(e.event.payload as unknown as PayloadByName[N]),
		);
	}

	/**
	 * Sends an ack-only command and waits for its ack. The room answers in
	 * order, so every message it sent this socket earlier has arrived.
	 */
	async barrier(): Promise<void> {
		await this.ack(this.send({ type: 'rematch.vote', mode: 'decline' }));
	}

	clearInbox(): void {
		this.inbox.length = 0;
	}

	close(): void {
		try {
			this.socket.close(1000, 'test complete');
		} catch {
			// Already closed by the server.
		}
	}

	private receive(text: string): void {
		try {
			const envelope = parseServerEventEnvelopeV1(JSON.parse(text));
			if (envelope.event.type === 'domain.event') {
				const schema = PAYLOAD_SCHEMAS[envelope.event.name as keyof typeof PAYLOAD_SCHEMAS];
				if (schema === undefined) throw new Error(`unknown domain event ${envelope.event.name}`);
				schema.parse(envelope.event.payload);
			}
			this.inbox.push(envelope);
		} catch (error) {
			this.problems.push(error instanceof Error ? error.message : String(error));
		}
		this.notify();
	}

	private notify(): void {
		for (const listener of [...this.listeners]) listener();
	}

	private describeInbox(): string {
		return this.inbox
			.map((e) =>
				e.event.type === 'domain.event'
					? e.event.name
					: e.event.type === 'room.snapshot'
						? `view(${String((e.event.state as { phase?: unknown }).phase)})`
						: e.event.type,
			)
			.join(', ');
	}
}

export interface JoinOptions {
	readonly team?: TeamId;
	readonly accountToken?: string;
	readonly recentWordIds?: readonly string[];
}

/** Opens a socket and joins; resolves once the seat is issued and acknowledged. */
export async function joinRoom(roomCode: string, displayName: string, options: JoinOptions = {}): Promise<RoomSocket> {
	const client = await RoomSocket.open(roomCode);
	const commandId = client.send({
		type: 'room.join',
		displayName,
		...(options.team === undefined ? {} : { team: options.team }),
		...(options.accountToken === undefined ? {} : { accountToken: options.accountToken }),
		...(options.recentWordIds === undefined ? {} : { recentWordIds: [...options.recentWordIds] }),
	});
	const session = await client.domain('session.issued');
	await client.ack(commandId);
	client.memberId = session.memberId;
	client.resumeToken = session.resumeToken;
	return client;
}

/** Opens a new socket and resumes an existing seat. */
export async function resumeRoom(roomCode: string, resumeToken: string): Promise<RoomSocket> {
	const client = await RoomSocket.open(roomCode);
	const commandId = client.send({ type: 'room.resume', resumeToken });
	const session = await client.domain('session.issued');
	await client.ack(commandId);
	client.memberId = session.memberId;
	client.resumeToken = session.resumeToken;
	return client;
}

/** Sends a command and waits for its ack (fails the test on a protocol error). */
export async function run(client: RoomSocket, command: ClientCommand): Promise<void> {
	const commandId = client.send(command);
	const outcome = await client.next(
		(e) => (e.event.type === 'command.ack' || e.event.type === 'protocol.error') && e.event.commandId === commandId,
		`${command.type} outcome`,
	);
	if (outcome.event.type === 'protocol.error') throw new Error(`${command.type} rejected: ${outcome.event.message}`);
}

export function closeAll(...clients: readonly RoomSocket[]): void {
	for (const client of clients) client.close();
}
