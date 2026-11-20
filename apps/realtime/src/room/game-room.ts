import {
	EMPTY_WORD_MEMORY,
	advanceRoom,
	applyRoomCommand,
	createRoomState,
	getNextWakeAtMs,
	type RoomCommand,
	type RoomCommandResult,
	type RoomEffect,
	type RoomPhase,
	type RoomState,
} from '@drawing-games/game-core';
import {
	ROOM_DOMAIN_EVENT_NAMES,
	commandEnvelopeV1Schema,
	roomCodeSchema,
	sessionIdSchema,
	type CommandEnvelopeV1,
	type JoinCommand,
	type ProtocolErrorCode,
	type ResumeCommand,
} from '@drawing-games/protocol';
import { DurableObject } from 'cloudflare:workers';

import { recordAccountMatch, recordAccountWords, verifyAccountToken, type VerifiedAccount } from '../accounts/client';
import type { Env } from '../env';
import { isWebSocketUpgrade, jsonResponse, methodNotAllowed, upgradeRequired } from '../http';
import { applyCanvasEffects } from './canvas-effects';
import { CanvasStore } from './canvas-store';
import { CommandLog, commandSignature, type CommandRecord } from './command-log';
import { mapMemberCommand, type MemberCommand } from './command-map';
import { CLOSE_CODES, IDLE_ROOM_TTL_MS } from './constants';
import { MessageTooLargeError, decodeClientMessage, domainEvent, encodeEnvelope, errorEvent, readCommandId } from './envelopes';
import { describeError } from './log';
import { RoomOutbox } from './outbox';
import { PreviewThrottle } from './preview-throttle';
import { activeMemberCount, applyServerCommands, findActiveHuman, removedHumanIds } from './room-state';
import { createRoomSchema, roomSchemaExists } from './schema';
import { createMemberId, createResumeToken, randomUint32, sha256Hex } from './secrets';
import { deleteMemberSessions, findSessionMember, insertSession } from './session-store';
import { SocketRegistry, safeClose, safeSend } from './sockets';
import { loadRoomState, saveRoomState } from './state-store';
import { startingWordMemory } from './word-memory';

export interface RoomInfo {
	readonly exists: boolean;
	readonly phase: RoomPhase | null;
	readonly memberCount: number;
}

interface CommitInput {
	readonly next: RoomState;
	readonly effects: readonly RoomEffect[];
	readonly command?: CommandRecord;
	readonly session?: { readonly tokenHash: string; readonly memberId: string };
	/** The socket that sent the command; if its own member left, it is unbound but not closed. */
	readonly sender?: WebSocket;
	/** Runs once the change is durable and before any view goes out (bind, ack). */
	readonly onCommitted?: (state: RoomState) => void;
}

const SEAT_EXPIRED = 'This seat is no longer in the room. Join again.';
/** After a failed alarm, wait at least this long before trying again. */
const ALARM_RETRY_MS = 5_000;

/**
 * One Dual Draw room: the authoritative owner of its phases, deadlines,
 * roles, guesses, points, and canvases. Rules come from the deterministic
 * game-core reducer; this class authenticates sockets, persists every change
 * before anyone can observe it, and delivers per-viewer projections.
 *
 * Concurrency: handlers await only before their critical section (token
 * hashing, account verification). Reading state, applying the reducer,
 * persisting, and sending all happen synchronously, so interleaved events
 * always see the latest state.
 */
export class GameRoom extends DurableObject<Env> {
	private state: RoomState | null = null;
	private readonly sockets: SocketRegistry;
	private readonly canvases: CanvasStore;
	private readonly commandLog: CommandLog;
	private readonly outbox: RoomOutbox;
	private readonly previews: PreviewThrottle;
	/** Alarm time last requested (null: unknown, e.g. after waking up). */
	private alarmAtMs: number | null = null;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sockets = new SocketRegistry(ctx);
		this.canvases = new CanvasStore(ctx.storage.sql);
		this.commandLog = new CommandLog(ctx.storage.sql);
		this.outbox = new RoomOutbox(this.sockets, this.canvases);
		this.previews = new PreviewThrottle((canvasId) => {
			if (this.state !== null) this.outbox.previewToWatchers(this.state, canvasId);
		});
		void ctx.blockConcurrencyWhile(async () => {
			this.load();
			this.guarded('presence reconcile', () => this.reconcilePresence());
			await this.armAlarm();
		});
	}

	/* --------------------------------- RPC --------------------------------- */

	/** Creates the room under its own name. False if it already exists. */
	async create(roomCode: string): Promise<boolean> {
		const code = roomCodeSchema.safeParse(roomCode);
		const name = this.ctx.id.name;
		if (!code.success || (name !== undefined && name !== code.data) || this.state !== null) return false;
		const state = createRoomState({ roomCode: code.data, nowMs: Date.now(), seed: randomUint32() });
		this.ctx.storage.transactionSync(() => {
			createRoomSchema(this.sql);
			saveRoomState(this.sql, null, state);
		});
		this.state = state;
		await this.armAlarm();
		return true;
	}

	async info(): Promise<RoomInfo> {
		const state = this.state;
		if (state === null) return { exists: false, phase: null, memberCount: 0 };
		return { exists: true, phase: state.phase, memberCount: activeMemberCount(state) };
	}

	/* ------------------------------ WebSockets ----------------------------- */

	async fetch(request: Request): Promise<Response> {
		if (request.method !== 'GET') return methodNotAllowed('GET');
		if (!isWebSocketUpgrade(request)) return upgradeRequired();
		const url = new URL(request.url);
		const roomCode = roomCodeSchema.safeParse(url.searchParams.get('roomCode'));
		const sessionId = sessionIdSchema.safeParse(url.searchParams.get('sessionId'));
		if (!roomCode.success || !sessionId.success) return jsonResponse({ error: 'Invalid room code or sessionId' }, 400);

		const pair = new WebSocketPair();
		const [client, server] = [pair[0], pair[1]];
		if (this.state === null || this.state.roomCode !== roomCode.data) {
			// One ROOM_NOT_FOUND error, then close 4404, which clients treat as
			// final (a refused upgrade looks like a network failure and would be
			// retried). Accepted through the hibernation API like every room
			// socket, but without an attachment, so it never counts as a member:
			// a request-bound socket (`server.accept()`) closed during this
			// fetch raised an uncaught "Network connection lost" once the client
			// went away.
			this.ctx.acceptWebSocket(server);
			sendRoomNotFound(server, roomCode.data);
		} else {
			this.sockets.accept(server, sessionId.data);
		}
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		const entry = this.sockets.entry(ws);
		if (entry === null) {
			safeClose(ws, CLOSE_CODES.internal, 'Invalid connection state');
			return;
		}
		const state = this.state;
		if (state === null) {
			sendRoomNotFound(ws, this.ctx.id.name ?? '');
			return;
		}

		let raw: unknown;
		try {
			raw = decodeClientMessage(message);
		} catch (error) {
			this.outbox.send(ws, state, errorEvent('BAD_COMMAND', 'Commands must be JSON of at most 64 KiB.'));
			if (error instanceof MessageTooLargeError) safeClose(ws, CLOSE_CODES.tooLarge, 'Message too large');
			return;
		}
		const parsed = commandEnvelopeV1Schema.safeParse(raw);
		if (!parsed.success) {
			this.outbox.send(ws, state, errorEvent('BAD_COMMAND', 'Command is not a valid protocol v1 envelope.', readCommandId(raw)));
			return;
		}
		const envelope = parsed.data;
		if (envelope.roomCode !== state.roomCode || envelope.sessionId !== entry.sessionId) {
			this.reject(ws, envelope, 'UNAUTHORIZED', 'Command identity does not match this connection.');
			return;
		}

		try {
			await this.dispatch(ws, entry.memberId, envelope);
		} catch (error) {
			// describeError carries names/messages only; commands may hold tokens.
			console.error('room: command failed', { command: envelope.command.type, ...describeError(error) });
			this.reloadFromStorage();
			this.reject(ws, envelope, 'INTERNAL', 'The room could not process this command. Try again.', true);
		}
	}

	async webSocketClose(ws: WebSocket, code: number): Promise<void> {
		// Complete the closing handshake; the runtime does not reply on its own.
		safeClose(ws, isSendableCloseCode(code) ? code : 1000, 'Closing');
		await this.releaseClosedSocket(ws);
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		safeClose(ws, CLOSE_CODES.internal, 'WebSocket error');
		await this.releaseClosedSocket(ws);
	}

	/* -------------------------------- Alarms ------------------------------- */

	async alarm(): Promise<void> {
		this.alarmAtMs = null;
		const state = this.state;
		if (state === null) return;
		const nowMs = Date.now();
		const ok = this.guarded('alarm', () => {
			const result = advanceRoom(state, nowMs);
			if (result.state !== state || result.effects.length > 0) this.commit({ next: result.state, effects: result.effects });
		});
		if (ok && this.isIdle(nowMs)) {
			await this.destroy();
			return;
		}
		await this.armAlarm(ok ? undefined : nowMs + ALARM_RETRY_MS);
	}

	/* ------------------------------- Commands ------------------------------ */

	private async dispatch(ws: WebSocket, memberId: string | null, envelope: CommandEnvelopeV1): Promise<void> {
		const { command } = envelope;
		if (command.type === 'room.join' || command.type === 'room.resume') {
			if (memberId !== null) this.reject(ws, envelope, 'BAD_COMMAND', 'This connection has already joined the room.');
			else if (command.type === 'room.join') await this.join(ws, envelope, command);
			else await this.resume(ws, envelope, command);
		} else if (memberId === null) {
			this.reject(ws, envelope, 'UNAUTHORIZED', 'Join or resume the room first.');
		} else {
			await this.runMemberCommand(ws, memberId, envelope, command);
		}
		await this.armAlarm();
	}

	private async join(ws: WebSocket, envelope: CommandEnvelopeV1, command: JoinCommand): Promise<void> {
		const account = command.accountToken === undefined ? null : await verifyAccountToken(this.env, command.accountToken);
		const memberId = createMemberId();
		// SECURITY: the resume token is sent to this socket only; storage keeps its hash.
		const resumeToken = createResumeToken();
		const [tokenHash, signature] = await Promise.all([sha256Hex(resumeToken), commandSignature(envelope)]);

		// No awaits below: this section sees and replaces the latest state.
		if (!this.sockets.canHandshake(ws)) return;
		const existing = this.commandLog.find(envelope.commandId);
		if (existing !== null) {
			// A retried join: its first answer was lost, so seat the same member
			// again with a fresh token instead of creating a second member.
			if (existing.signature !== signature) this.rejectReusedCommandId(ws, envelope);
			else this.seat(ws, envelope, existing.memberId, account, { resumeToken, tokenHash, ack: 'duplicate' });
			return;
		}
		const result = applyRoomCommand(
			this.requireState(),
			{
				type: 'member.join',
				memberId,
				displayName: command.displayName,
				accountId: account?.accountId ?? null,
				memory: startingWordMemory(account?.memory ?? null, command.recentWordIds ?? []),
				...(command.team === undefined ? {} : { preferredTeam: command.team }),
			},
			Date.now(),
		);
		if (!result.ok) {
			this.commitRejection(ws, envelope, result);
			return;
		}
		this.commit({
			next: result.state,
			effects: result.effects,
			command: { commandId: envelope.commandId, memberId, signature, clientSeq: envelope.clientSeq, roomSeq: result.state.seq },
			session: { tokenHash, memberId },
			sender: ws,
			onCommitted: (state) => this.completeHandshake(ws, state, envelope, memberId, resumeToken, 'applied'),
		});
	}

	private async resume(ws: WebSocket, envelope: CommandEnvelopeV1, command: ResumeCommand): Promise<void> {
		const resumeToken = command.resumeToken;
		if (resumeToken === undefined) {
			this.reject(ws, envelope, 'UNAUTHORIZED', SEAT_EXPIRED);
			return;
		}
		const tokenHash = await sha256Hex(resumeToken);
		const accountToken = command.accountToken;
		// Only verify (an RPC) when the seat could take a link: it has no account yet.
		const account =
			accountToken !== undefined && this.seatLacksAccount(findSessionMember(this.sql, tokenHash))
				? await verifyAccountToken(this.env, accountToken)
				: null;

		// No awaits below.
		this.seat(ws, envelope, findSessionMember(this.sql, tokenHash), account, { resumeToken, ack: 'applied' });
	}

	/** Binds a socket to an existing member: a resume, or a retried join. */
	private seat(
		ws: WebSocket,
		envelope: CommandEnvelopeV1,
		memberId: string | null,
		account: VerifiedAccount | null,
		issue: { readonly resumeToken: string; readonly tokenHash?: string; readonly ack: 'applied' | 'duplicate' },
	): void {
		// The socket may have closed or bound while the handshake awaited.
		if (!this.sockets.canHandshake(ws)) return;
		const prev = this.requireState();
		const member = memberId === null ? undefined : findActiveHuman(prev, memberId);
		if (member === undefined) {
			this.reject(ws, envelope, 'UNAUTHORIZED', SEAT_EXPIRED);
			return;
		}
		const commands: RoomCommand[] = [{ type: 'member.presence', memberId: member.id, connected: true }];
		if (account !== null && member.accountId === null) {
			commands.push({
				type: 'member.link-account',
				memberId: member.id,
				accountId: account.accountId,
				memory: startingWordMemory(account.memory, []),
			});
		}
		const { state: next, effects } = applyServerCommands(prev, commands, Date.now());
		// One live socket per member: the newest wins.
		for (const older of this.sockets.socketsOf(member.id)) {
			if (older === ws) continue;
			this.sockets.unbind(older);
			safeClose(older, CLOSE_CODES.replaced, 'Replaced by a newer connection');
		}
		this.commit({
			next,
			effects,
			...(issue.tokenHash === undefined ? {} : { session: { tokenHash: issue.tokenHash, memberId: member.id } }),
			sender: ws,
			onCommitted: (state) => this.completeHandshake(ws, state, envelope, member.id, issue.resumeToken, issue.ack),
		});
	}

	private completeHandshake(
		ws: WebSocket,
		state: RoomState,
		envelope: CommandEnvelopeV1,
		memberId: string,
		resumeToken: string,
		status: 'applied' | 'duplicate',
	): void {
		this.sockets.bind(ws, memberId);
		this.outbox.send(ws, state, domainEvent({ name: ROOM_DOMAIN_EVENT_NAMES.sessionIssued, payload: { memberId, resumeToken } }));
		this.sendAck(ws, state.roomCode, state.seq, envelope, status);
	}

	private async runMemberCommand(ws: WebSocket, memberId: string, envelope: CommandEnvelopeV1, command: MemberCommand): Promise<void> {
		const mapped = mapMemberCommand(command, memberId);
		const signature = await commandSignature(envelope);
		let roomCommand: RoomCommand | null = null;
		if (mapped.kind === 'room') {
			roomCommand = mapped.command;
		} else if (mapped.kind === 'link-account') {
			const token = mapped.accountToken;
			const account = token === null ? null : await verifyAccountToken(this.env, token);
			if (token !== null && account === null) {
				this.reject(ws, envelope, 'UNAUTHORIZED', 'That account session has expired. Log in again.');
				return;
			}
			roomCommand = {
				type: 'member.link-account',
				memberId,
				accountId: account?.accountId ?? null,
				memory: account === null ? EMPTY_WORD_MEMORY : startingWordMemory(account.memory, []),
			};
		}

		// No awaits below.
		const existing = this.commandLog.find(envelope.commandId);
		if (existing !== null) {
			if (existing.memberId !== memberId || existing.signature !== signature) this.rejectReusedCommandId(ws, envelope);
			else this.sendAck(ws, this.requireState().roomCode, existing.roomSeq, envelope, 'duplicate');
			return;
		}
		const prev = this.requireState();
		const result: RoomCommandResult =
			roomCommand === null ? { ok: true, state: prev, effects: [] } : applyRoomCommand(prev, roomCommand, Date.now());
		if (!result.ok) {
			this.commitRejection(ws, envelope, result);
			return;
		}
		this.commit({
			next: result.state,
			effects: result.effects,
			command: { commandId: envelope.commandId, memberId, signature, clientSeq: envelope.clientSeq, roomSeq: result.state.seq },
			sender: ws,
			onCommitted: (state) => this.sendAck(ws, state.roomCode, state.seq, envelope, 'applied'),
		});
	}

	/** A rejected command may still have advanced deadlines; keep that progress. */
	private commitRejection(ws: WebSocket, envelope: CommandEnvelopeV1, result: Extract<RoomCommandResult, { ok: false }>): void {
		const code: ProtocolErrorCode = result.error.code;
		this.commit({
			next: result.state,
			effects: result.effects,
			onCommitted: () => this.reject(ws, envelope, code, result.error.message),
		});
	}

	/* -------------------------------- Commit ------------------------------- */

	/**
	 * Persists a change atomically (state parts, canvases, command log,
	 * sessions), then executes effects, runs the caller's hook (ack), and
	 * delivers views and canvases.
	 */
	private commit(input: CommitInput): void {
		const prev = this.requireState();
		const { next, effects } = input;
		const nowMs = Date.now();
		const { changes, startedMatch } = applyCanvasEffects(this.canvases, prev, next, effects);
		const removed = removedHumanIds(prev, next);
		this.ctx.storage.transactionSync(() => {
			if (next !== prev) saveRoomState(this.sql, prev, next);
			this.canvases.flush(nowMs);
			if (input.command !== undefined) this.commandLog.insert(input.command, nowMs);
			if (input.session !== undefined) insertSession(this.sql, input.session.tokenHash, input.session.memberId, nowMs);
			if (removed.length > 0) deleteMemberSessions(this.sql, removed);
		});
		this.state = next;
		if (startedMatch) this.previews.clear();

		this.runEffects(next, effects);
		input.onCommitted?.(next);
		for (const memberId of removed) {
			for (const ws of this.sockets.socketsOf(memberId)) {
				this.sockets.unbind(ws);
				// The leaver's own socket closes itself after its ack.
				if (ws !== input.sender) safeClose(ws, CLOSE_CODES.removed, 'Removed from the room');
			}
		}
		this.outbox.views(next, nowMs);
		this.outbox.canvasesFor(next, changes);
		for (const canvasId of changes.drawnIds) this.previews.request(canvasId);
	}

	private runEffects(state: RoomState, effects: readonly RoomEffect[]): void {
		for (const effect of effects) {
			switch (effect.type) {
				case 'guess.feedback':
					this.outbox.toMember(
						state,
						effect.memberId,
						domainEvent({ name: ROOM_DOMAIN_EVENT_NAMES.guessFeedback, payload: { text: effect.text, verdict: effect.verdict } }),
					);
					break;
				// Account writes never block or fail the game loop (client.ts swallows errors).
				case 'account.words':
					this.ctx.waitUntil(recordAccountWords(this.env, effect.accountId, effect.events));
					break;
				case 'account.match':
					this.ctx.waitUntil(recordAccountMatch(this.env, effect.accountId, effect.summary));
					break;
				case 'canvas.reset':
				case 'canvas.ops':
					// Applied by applyCanvasEffects before the commit transaction.
					break;
			}
		}
	}

	/* ------------------------------- Presence ------------------------------ */

	private async releaseClosedSocket(ws: WebSocket): Promise<void> {
		const memberId = this.sockets.entry(ws)?.memberId ?? null;
		if (memberId === null) return;
		this.sockets.unbind(ws);
		const state = this.state;
		if (state === null || this.sockets.socketsOf(memberId).length > 0) return;
		if (findActiveHuman(state, memberId)?.connected !== true) return;
		this.guarded('presence', () => {
			const { state: next, effects } = applyServerCommands(state, [{ type: 'member.presence', memberId, connected: false }], Date.now());
			this.commit({ next, effects });
		});
		await this.armAlarm();
	}

	/** After a restart, members whose sockets did not survive are marked disconnected. */
	private reconcilePresence(): void {
		const state = this.state;
		if (state === null) return;
		const online = this.sockets.memberIds();
		const commands: RoomCommand[] = state.members
			.filter((member) => member.kind === 'human' && member.left !== true && member.connected && !online.has(member.id))
			.map((member) => ({ type: 'member.presence', memberId: member.id, connected: false }));
		if (commands.length === 0) return;
		const { state: next, effects } = applyServerCommands(state, commands, Date.now());
		this.commit({ next, effects });
	}

	/* ------------------------------- Lifecycle ----------------------------- */

	private load(): void {
		this.state = roomSchemaExists(this.sql) ? loadRoomState(this.sql) : null;
	}

	/** Memory is only a cache: after a failure, start over from storage. */
	private reloadFromStorage(): void {
		this.previews.clear();
		this.canvases.dropCache();
		this.commandLog.reset();
		this.sockets.forgetDeliveries();
		this.alarmAtMs = null;
		this.load();
	}

	private isIdle(nowMs: number): boolean {
		const state = this.state;
		return state !== null && !this.sockets.hasSockets() && nowMs - state.lastActivityAtMs >= IDLE_ROOM_TTL_MS;
	}

	private async destroy(): Promise<void> {
		this.state = null;
		this.previews.clear();
		this.canvases.dropCache();
		this.commandLog.reset();
		this.alarmAtMs = null;
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.deleteAll();
	}

	/** Wakes at the next reducer deadline or bot action, or for idle cleanup. */
	private armAlarm(notBeforeMs?: number): Promise<void> {
		const state = this.state;
		if (state === null) return Promise.resolve();
		const nowMs = Date.now();
		let cleanupAt = state.lastActivityAtMs + IDLE_ROOM_TTL_MS;
		// Idle but still connected: look again a full window later.
		if (cleanupAt <= nowMs) cleanupAt = nowMs + IDLE_ROOM_TTL_MS;
		const wake = getNextWakeAtMs(state);
		let atMs = wake === null ? cleanupAt : Math.min(wake, cleanupAt);
		if (notBeforeMs !== undefined) atMs = Math.max(atMs, notBeforeMs);
		if (atMs === this.alarmAtMs) return Promise.resolve();
		this.alarmAtMs = atMs;
		return this.ctx.storage.setAlarm(atMs);
	}

	/* -------------------------------- Helpers ------------------------------ */

	private get sql(): SqlStorage {
		return this.ctx.storage.sql;
	}

	private seatLacksAccount(memberId: string | null): boolean {
		const state = this.state;
		return memberId !== null && state !== null && findActiveHuman(state, memberId)?.accountId === null;
	}

	private requireState(): RoomState {
		if (this.state === null) throw new Error('Room does not exist');
		return this.state;
	}

	/** Runs server-initiated work; on failure, logs and reloads from storage. */
	private guarded(label: string, work: () => void): boolean {
		try {
			work();
			return true;
		} catch (error) {
			console.error(`room: ${label} failed`, describeError(error));
			this.reloadFromStorage();
			return false;
		}
	}

	private sendAck(ws: WebSocket, roomCode: string, roomSeq: number, envelope: CommandEnvelopeV1, status: 'applied' | 'duplicate'): void {
		safeSend(
			ws,
			encodeEnvelope(roomCode, roomSeq, { type: 'command.ack', commandId: envelope.commandId, clientSeq: envelope.clientSeq, status }),
		);
	}

	private reject(ws: WebSocket, envelope: CommandEnvelopeV1, code: ProtocolErrorCode, message: string, retryable = false): void {
		safeSend(ws, encodeEnvelope(envelope.roomCode, this.state?.seq ?? 0, errorEvent(code, message, envelope.commandId, retryable)));
	}

	private rejectReusedCommandId(ws: WebSocket, envelope: CommandEnvelopeV1): void {
		this.reject(ws, envelope, 'BAD_COMMAND', 'That commandId was already used for a different command.');
	}
}

/** Codes an endpoint may put in its own close frame (1005/1006/1015 are reserved). */
function isSendableCloseCode(code: number): boolean {
	return code === 1000 || (code >= 3000 && code <= 4999);
}

function sendRoomNotFound(ws: WebSocket, roomCode: string): void {
	safeSend(ws, encodeEnvelope(roomCode, 0, errorEvent('ROOM_NOT_FOUND', 'This room does not exist.')));
	safeClose(ws, CLOSE_CODES.notFound, 'Room not found');
}
