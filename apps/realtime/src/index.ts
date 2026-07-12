import {
	createDrawingState,
	drawingReducer,
	type DrawingAction,
	type DrawingDocument,
	type DrawingState,
} from '@drawing-games/drawing-model';
import { getDrawingSubmissionAuthorization, type TeamId } from '@drawing-games/game-core';
import {
	AUTHORITATIVE_DRAWING_DOCUMENT_EVENT_NAME,
	OPPONENT_DRAWING_ACTIVITY_EVENT_NAME,
	PROTOCOL_VERSION,
	parseCommandEnvelopeV1,
	roomCodeSchema,
	sessionIdSchema,
	type AckServerEvent,
	type AuthoritativeDrawingDocumentDomainEvent,
	type CommandEnvelopeV1,
	type DrawingHistoryCapabilities,
	type ErrorServerEvent,
	type OpponentDrawingActivityDomainEvent,
	type ProtocolErrorCode,
	type RoomSnapshotState,
	type ServerEvent,
	type ServerEventEnvelopeV1,
	type TypedRoomSnapshotServerEvent,
} from '@drawing-games/protocol';
import { DurableObject } from 'cloudflare:workers';

export interface Env {
	GAME_ROOM: DurableObjectNamespace<GameRoom>;
}

type PlayerRole = 'drawer' | 'guesser';
type ClientCommand = CommandEnvelopeV1['command'];
type ClientCommandOfType<Type extends ClientCommand['type']> = Extract<ClientCommand, { type: Type }>;
type OutboundServerEvent =
	ServerEvent | TypedRoomSnapshotServerEvent | AuthoritativeDrawingDocumentDomainEvent | OpponentDrawingActivityDomainEvent;

interface ConnectionAttachment {
	readonly version: 1;
	readonly roomCode: string;
	readonly sessionId: string;
	readonly team?: TeamId;
	readonly role?: PlayerRole;
	readonly superseded?: true;
}

interface StoredMember {
	readonly sessionId: string;
	readonly displayName: string;
	readonly team: TeamId;
	readonly role: PlayerRole;
	readonly joinedAtRoomSeq: number;
}

interface StoredRoomState {
	readonly version: 1;
	readonly roomSeq: number;
	readonly phase: 'drawing';
	readonly members: Readonly<Record<string, StoredMember>>;
	readonly teamDrawings: Readonly<Record<TeamId, DrawingState>>;
	readonly acceptedClientSeqBySession: Readonly<Record<string, number>>;
	readonly recentCommandIds: readonly string[];
}

type StoredEffectDescriptor = { readonly kind: 'snapshot' } | { readonly kind: 'drawing'; readonly team: TeamId };

interface StoredCommand {
	readonly sessionId: string;
	readonly clientSeq: number;
	readonly signatureHash: string;
	readonly appliedAck: ServerEventEnvelopeV1;
	readonly effect: StoredEffectDescriptor;
	readonly recoveryReplayCount: number;
}

interface StoredDeadline {
	readonly atMs: number;
	readonly token: string;
}

type AppliedEffect =
	| { readonly kind: 'snapshot'; readonly state: RoomSnapshotState }
	| {
			readonly kind: 'drawing';
			readonly team: TeamId;
			readonly document: DrawingDocument;
			readonly capabilities: DrawingHistoryCapabilities;
	  };

type CommandCommit =
	| {
			readonly kind: 'applied';
			readonly envelope: ServerEventEnvelopeV1;
			readonly effect: AppliedEffect;
			readonly effectRoomSeq: number;
	  }
	| {
			readonly kind: 'duplicate';
			readonly envelope: ServerEventEnvelopeV1;
			readonly effect: AppliedEffect | null;
			readonly effectRoomSeq: number;
	  }
	| { readonly kind: 'conflict'; readonly roomSeq: number }
	| {
			readonly kind: 'rejected';
			readonly roomSeq: number;
			readonly code: ProtocolErrorCode;
			readonly message: string;
			readonly details?: Record<string, string | number | boolean>;
	  };

type CommandPreparation =
	| {
			readonly kind: 'accepted';
			readonly room: StoredRoomState;
			readonly effect: AppliedEffect;
	  }
	| {
			readonly kind: 'rejected';
			readonly code: ProtocolErrorCode;
			readonly message: string;
			readonly details?: Record<string, string | number | boolean>;
	  };

type BatchApplication =
	{ readonly kind: 'applied'; readonly state: DrawingState } | { readonly kind: 'rejected'; readonly message: string };

const ROOM_STATE_KEY = 'roomState';
const LEGACY_ROOM_SEQUENCE_KEY = 'roomSeq';
const NEXT_DEADLINE_KEY = 'nextDeadline';
const COMMAND_KEY_PREFIX = 'commands-v2/';
const LEGACY_COMMAND_KEY_PREFIX = 'commands/';
const LEGACY_CLEANUP_BATCH = 32;
const MAX_COMMAND_BYTES = 512 * 1024;
const MAX_ROOM_MEMBERS = 16;
const MAX_TEAM_MEMBERS = MAX_ROOM_MEMBERS / 2;
const MAX_RECENT_COMMANDS = 512;
const DRAWING_HISTORY_LIMIT = 32;
const MAX_CURRENT_STROKES_PER_TEAM = 512;
const MAX_CURRENT_POINTS_PER_TEAM = 50_000;
const MAX_KNOWN_STROKE_IDS_PER_TEAM = 1_024;
const MAX_PERSISTED_ROOM_BYTES = 1_500_000;
const ROOM_SOCKET_ROUTE = /^\/rooms\/([^/]+)\/socket$/;

export class GameRoom extends DurableObject<Env> {
	private actorQueue: Promise<void> = Promise.resolve();

	fetch(request: Request): Promise<Response> {
		return this.enqueue(() => this.handleFetch(request));
	}

	private async handleFetch(request: Request): Promise<Response> {
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
		const room = await this.getRoomState();
		const member = getOwnRecordValue(room.members, sessionId);
		const [client, server] = Object.values(new WebSocketPair());
		const attachment: ConnectionAttachment = member
			? {
					version: PROTOCOL_VERSION,
					roomCode,
					sessionId,
					team: member.team,
					role: member.role,
				}
			: {
					version: PROTOCOL_VERSION,
					roomCode,
					sessionId,
				};

		for (const existingSocket of this.ctx.getWebSockets()) {
			const existingAttachment = readAttachment(existingSocket);
			if (existingAttachment?.sessionId === sessionId) {
				existingSocket.serializeAttachment({
					...existingAttachment,
					superseded: true,
				} satisfies ConnectionAttachment);
				safeClose(existingSocket, 4005, 'Session opened elsewhere');
			}
		}

		this.ctx.acceptWebSocket(server);
		server.serializeAttachment(attachment);
		safeSend(server, createServerEnvelope(roomCode, room.roomSeq, createSnapshotEvent(room, member)));

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		return this.enqueue(() => this.processWebSocketMessage(ws, message));
	}

	private async processWebSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		const attachment = readAttachment(ws);

		if (attachment === null) {
			safeClose(ws, 1011, 'Invalid connection state');
			return;
		}

		if (attachment.superseded === true) {
			safeClose(ws, 4005, 'Session opened elsewhere');
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
					await this.publishAppliedEffect(ws, attachment, commit.effectRoomSeq, commit.effect, true);
					// Publish the durable effect first. If execution stops before the
					// receipt, the exact retry republishes the idempotent projection.
					safeSend(ws, commit.envelope);
					return;
				case 'duplicate':
					if (commit.effect !== null) {
						await this.publishAppliedEffect(ws, attachment, commit.effectRoomSeq, commit.effect, false);
					}
					safeSend(ws, commit.envelope);
					return;
				case 'conflict':
					safeSend(
						ws,
						createServerEnvelope(attachment.roomCode, commit.roomSeq, {
							type: 'protocol.error',
							code: 'BAD_COMMAND',
							message: 'commandId was already used by another command',
							retryable: false,
							commandId: envelope.commandId,
						}),
					);
					return;
				case 'rejected':
					safeSend(
						ws,
						createServerEnvelope(attachment.roomCode, commit.roomSeq, {
							type: 'protocol.error',
							code: commit.code,
							message: commit.message,
							retryable: false,
							commandId: envelope.commandId,
							...(commit.details === undefined ? {} : { details: commit.details }),
						}),
					);
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
		// Membership is session-based and durable, so a transport close is not a
		// leave-game command. Reopening Safari resumes the same role and vectors.
	}

	async alarm(): Promise<void> {
		const deadline = await this.ctx.storage.get<StoredDeadline>(NEXT_DEADLINE_KEY);

		if (deadline === undefined || !isStoredDeadline(deadline)) {
			return;
		}

		if (deadline.atMs > Date.now()) {
			await this.ctx.storage.setAlarm(deadline.atMs);
			return;
		}

		// Future phase reducers will compare this token and transition atomically.
	}

	private async commitCommand(envelope: CommandEnvelopeV1): Promise<CommandCommit> {
		const commandKey = `${COMMAND_KEY_PREFIX}${envelope.commandId}`;
		const signatureHash = await commandSignatureHash(envelope);

		return this.ctx.storage.transaction(async (transaction) => {
			const [storedRoom, legacyRoomSeq, existing] = await Promise.all([
				transaction.get<StoredRoomState>(ROOM_STATE_KEY),
				transaction.get<number>(LEGACY_ROOM_SEQUENCE_KEY),
				transaction.get<StoredCommand>(commandKey),
			]);
			const room = normalizeStoredRoom(storedRoom, legacyRoomSeq);

			if (existing !== undefined) {
				if (
					existing.sessionId !== envelope.sessionId ||
					existing.clientSeq !== envelope.clientSeq ||
					existing.signatureHash !== signatureHash
				) {
					return { kind: 'conflict', roomSeq: room.roomSeq };
				}

				const duplicateEvent: AckServerEvent = {
					type: 'command.ack',
					commandId: envelope.commandId,
					clientSeq: envelope.clientSeq,
					status: 'duplicate',
				};
				const shouldReplay = existing.recoveryReplayCount === 0;

				if (shouldReplay) {
					await transaction.put(commandKey, {
						...existing,
						recoveryReplayCount: 1,
					} satisfies StoredCommand);
				}

				return {
					kind: 'duplicate',
					effect: shouldReplay ? materializeStoredEffect(room, existing) : null,
					effectRoomSeq: room.roomSeq,
					envelope: {
						...existing.appliedAck,
						serverTimeMs: Date.now(),
						event: duplicateEvent,
					},
				};
			}

			const acceptedClientSeq = getOwnRecordValue(room.acceptedClientSeqBySession, envelope.sessionId);

			if (acceptedClientSeq !== undefined && envelope.clientSeq <= acceptedClientSeq) {
				return {
					kind: 'rejected',
					roomSeq: room.roomSeq,
					code: 'STALE_CLIENT',
					message: 'clientSeq must increase for each accepted session command',
					details: { acceptedClientSeq },
				};
			}

			const preparation = prepareCommand(room, envelope);

			if (preparation.kind === 'rejected') {
				return {
					...preparation,
					roomSeq: room.roomSeq,
				};
			}

			if (room.roomSeq === Number.MAX_SAFE_INTEGER) {
				throw new Error('Room sequence exhausted');
			}

			const nextRoomSeq = room.roomSeq + 1;
			const recentCommandIds = [...room.recentCommandIds, envelope.commandId];
			const evictedCommandIds = recentCommandIds.slice(0, Math.max(0, recentCommandIds.length - MAX_RECENT_COMMANDS));
			const nextRoom: StoredRoomState = {
				...preparation.room,
				roomSeq: nextRoomSeq,
				acceptedClientSeqBySession: {
					...room.acceptedClientSeqBySession,
					[envelope.sessionId]: envelope.clientSeq,
				},
				recentCommandIds: recentCommandIds.slice(-MAX_RECENT_COMMANDS),
			};

			if (encodedByteLength(nextRoom) > MAX_PERSISTED_ROOM_BYTES) {
				return {
					kind: 'rejected',
					roomSeq: room.roomSeq,
					code: 'RATE_LIMITED',
					message: 'The room drawing has reached its storage limit',
				};
			}

			const appliedAck = createServerEnvelope(envelope.roomCode, nextRoomSeq, {
				type: 'command.ack',
				commandId: envelope.commandId,
				clientSeq: envelope.clientSeq,
				status: 'applied',
			});
			const stored: StoredCommand = {
				sessionId: envelope.sessionId,
				clientSeq: envelope.clientSeq,
				signatureHash,
				appliedAck,
				effect: describeEffect(preparation.effect),
				recoveryReplayCount: 0,
			};
			const legacyCommandKeys = [
				...(
					await transaction.list({
						prefix: LEGACY_COMMAND_KEY_PREFIX,
						limit: LEGACY_CLEANUP_BATCH,
					})
				).keys(),
			];

			// Membership, DrawingState, room sequence, and command dedupe become
			// visible together or not at all.
			await transaction.put(ROOM_STATE_KEY, nextRoom);
			await transaction.put(commandKey, stored);
			if (evictedCommandIds.length > 0) {
				await transaction.delete(evictedCommandIds.map((commandId) => `${COMMAND_KEY_PREFIX}${commandId}`));
			}
			await transaction.delete([LEGACY_ROOM_SEQUENCE_KEY, ...legacyCommandKeys]);

			return {
				kind: 'applied',
				envelope: appliedAck,
				effect: preparation.effect,
				effectRoomSeq: nextRoomSeq,
			};
		});
	}

	private async publishAppliedEffect(
		ws: WebSocket,
		attachment: ConnectionAttachment,
		roomSeq: number,
		effect: AppliedEffect,
		notifyOpponents: boolean,
	): Promise<void> {
		switch (effect.kind) {
			case 'snapshot':
				this.refreshSessionAttachments(attachment.sessionId, effect.state);
				safeSend(ws, createServerEnvelope(attachment.roomCode, roomSeq, createTypedSnapshotEvent(effect.state)));
				return;
			case 'drawing':
				this.broadcastDrawingProjection(attachment.roomCode, roomSeq, effect.team, effect.document, effect.capabilities, notifyOpponents);
				return;
		}
	}

	private refreshSessionAttachments(sessionId: string, state: RoomSnapshotState): void {
		if (state.kind !== 'drawing-room') {
			return;
		}

		for (const socket of this.ctx.getWebSockets()) {
			const current = readAttachment(socket);

			if (current?.sessionId !== sessionId) {
				continue;
			}

			socket.serializeAttachment({
				...current,
				team: state.viewer.team,
				role: state.viewer.role,
			} satisfies ConnectionAttachment);
		}
	}

	private broadcastDrawingProjection(
		roomCode: string,
		roomSeq: number,
		team: TeamId,
		document: DrawingDocument,
		capabilities: DrawingHistoryCapabilities,
		notifyOpponents: boolean,
	): void {
		const teamEnvelope = createServerEnvelope(roomCode, roomSeq, {
			type: 'domain.event',
			name: AUTHORITATIVE_DRAWING_DOCUMENT_EVENT_NAME,
			payload: { team, document, ...capabilities },
		});
		const opponentEnvelope = createServerEnvelope(roomCode, roomSeq, {
			type: 'domain.event',
			name: OPPONENT_DRAWING_ACTIVITY_EVENT_NAME,
			payload: { team, active: true },
		});

		for (const socket of this.ctx.getWebSockets()) {
			const socketAttachment = readAttachment(socket);

			if (socketAttachment?.superseded !== true && socketAttachment?.team === team) {
				safeSend(socket, teamEnvelope);
			} else if (notifyOpponents && socketAttachment?.superseded !== true && socketAttachment?.team === otherTeam(team)) {
				safeSend(socket, opponentEnvelope);
			}
		}
	}

	private enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
		const queued = this.actorQueue.then(operation);
		this.actorQueue = queued.then(
			() => undefined,
			() => undefined,
		);
		return queued;
	}

	private async getRoomState(): Promise<StoredRoomState> {
		const [storedRoom, legacyRoomSeq] = await Promise.all([
			this.ctx.storage.get<StoredRoomState>(ROOM_STATE_KEY),
			this.ctx.storage.get<number>(LEGACY_ROOM_SEQUENCE_KEY),
		]);
		return normalizeStoredRoom(storedRoom, legacyRoomSeq);
	}

	private async sendProtocolError(ws: WebSocket, roomCode: string, event: ErrorServerEvent): Promise<void> {
		const room = await this.getRoomState();
		safeSend(ws, createServerEnvelope(roomCode, room.roomSeq, event));
	}
}

const worker = {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/health') {
			if (request.method !== 'GET') {
				return methodNotAllowed('GET');
			}

			return jsonResponse({ status: 'ok' }, 200, {
				'Cache-Control': 'no-store',
			});
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

function prepareCommand(room: StoredRoomState, envelope: CommandEnvelopeV1): CommandPreparation {
	switch (envelope.command.type) {
		case 'room.join':
			return prepareJoin(room, envelope, envelope.command);
		case 'room.resume': {
			const member = getOwnRecordValue(room.members, envelope.sessionId);

			if (member === undefined) {
				return {
					kind: 'rejected',
					code: 'ROOM_NOT_FOUND',
					message: 'This session has not joined the room',
				};
			}

			return {
				kind: 'accepted',
				room,
				effect: {
					kind: 'snapshot',
					state: createDrawingRoomSnapshot(room, member),
				},
			};
		}
		case 'drawing.batch':
			return prepareDrawingBatch(room, envelope, envelope.command);
		default:
			return {
				kind: 'rejected',
				code: 'NOT_ALLOWED',
				message: 'This command is not available in the drawing pilot',
			};
	}
}

function describeEffect(effect: AppliedEffect): StoredEffectDescriptor {
	return effect.kind === 'snapshot' ? { kind: 'snapshot' } : { kind: 'drawing', team: effect.team };
}

function materializeStoredEffect(room: StoredRoomState, command: StoredCommand): AppliedEffect {
	if (command.effect.kind === 'snapshot') {
		const member = getOwnRecordValue(room.members, command.sessionId);

		if (member === undefined) {
			throw new Error('Stored snapshot effect references a missing member');
		}

		return {
			kind: 'snapshot',
			state: createDrawingRoomSnapshot(room, member),
		};
	}

	const state = room.teamDrawings[command.effect.team];
	return {
		kind: 'drawing',
		team: command.effect.team,
		document: projectVisibleDrawing(state),
		capabilities: getDrawingHistoryCapabilities(state),
	};
}

function prepareJoin(room: StoredRoomState, envelope: CommandEnvelopeV1, command: ClientCommandOfType<'room.join'>): CommandPreparation {
	const existing = getOwnRecordValue(room.members, envelope.sessionId);

	if (existing !== undefined) {
		return {
			kind: 'accepted',
			room,
			effect: {
				kind: 'snapshot',
				state: createDrawingRoomSnapshot(room, existing),
			},
		};
	}

	const members = Object.values(room.members);

	if (members.length >= MAX_ROOM_MEMBERS) {
		return {
			kind: 'rejected',
			code: 'ROOM_FULL',
			message: `Rooms support at most ${MAX_ROOM_MEMBERS} players`,
		};
	}

	const team = chooseTeam(members, command.preferredTeam);

	if (team === null) {
		return {
			kind: 'rejected',
			code: 'ROOM_FULL',
			message:
				command.preferredTeam === undefined
					? 'Both teams are full'
					: `Team ${command.preferredTeam} supports at most ${MAX_TEAM_MEMBERS} players`,
		};
	}

	const role: PlayerRole = members.some((member) => member.team === team && member.role === 'drawer') ? 'guesser' : 'drawer';
	const member: StoredMember = {
		sessionId: envelope.sessionId,
		displayName: command.displayName,
		team,
		role,
		joinedAtRoomSeq: room.roomSeq + 1,
	};
	const nextRoom: StoredRoomState = {
		...room,
		members: {
			...room.members,
			[member.sessionId]: member,
		},
	};

	return {
		kind: 'accepted',
		room: nextRoom,
		effect: {
			kind: 'snapshot',
			state: createDrawingRoomSnapshot(nextRoom, member),
		},
	};
}

function prepareDrawingBatch(
	room: StoredRoomState,
	envelope: CommandEnvelopeV1,
	command: ClientCommandOfType<'drawing.batch'>,
): CommandPreparation {
	const authorization = getDrawingSubmissionAuthorization({
		phase: room.phase,
		playerId: envelope.sessionId,
		members: Object.values(room.members).map((member) => ({
			id: member.sessionId,
			team: member.team,
		})),
		drawers: getDrawers(room),
	});

	if (!authorization.allowed) {
		return {
			kind: 'rejected',
			code: 'NOT_ALLOWED',
			message: 'Only the active drawer may change the team drawing',
			details: { reason: authorization.reason },
		};
	}

	const currentState = room.teamDrawings[authorization.team];
	const application = applyDrawingBatch(currentState, command.operations);

	if (application.kind === 'rejected') {
		return {
			kind: 'rejected',
			code: 'BAD_COMMAND',
			message: application.message,
		};
	}

	const nextRoom: StoredRoomState = {
		...room,
		teamDrawings: {
			...room.teamDrawings,
			[authorization.team]: application.state,
		},
	};

	return {
		kind: 'accepted',
		room: nextRoom,
		effect: {
			kind: 'drawing',
			team: authorization.team,
			document: projectVisibleDrawing(application.state),
			capabilities: getDrawingHistoryCapabilities(application.state),
		},
	};
}

function applyDrawingBatch(initialState: DrawingState, operations: readonly DrawingAction[]): BatchApplication {
	let state = initialState;

	for (const [index, operation] of operations.entries()) {
		const nextState = drawingReducer(state, operation);

		if (nextState === state) {
			return {
				kind: 'rejected',
				message: `Drawing operation ${index + 1} was a no-op or arrived out of order`,
			};
		}

		state = nextState;
	}

	const capacityProblem = getDrawingCapacityProblem(state);

	return capacityProblem === null ? { kind: 'applied', state } : { kind: 'rejected', message: capacityProblem };
}

function getDrawingCapacityProblem(state: DrawingState): string | null {
	const visible = projectVisibleDrawing(state);

	if (visible.strokeOrder.length > MAX_CURRENT_STROKES_PER_TEAM) {
		return `A team drawing may contain at most ${MAX_CURRENT_STROKES_PER_TEAM} visible strokes`;
	}

	let pointCount = 0;

	for (const strokeId of visible.strokeOrder) {
		pointCount += visible.strokesById[strokeId]?.points.length ?? 0;

		if (pointCount > MAX_CURRENT_POINTS_PER_TEAM) {
			return `A team drawing may contain at most ${MAX_CURRENT_POINTS_PER_TEAM} visible points`;
		}
	}

	if (Object.keys(state.knownStrokeIds).length > MAX_KNOWN_STROKE_IDS_PER_TEAM) {
		return `A team may create at most ${MAX_KNOWN_STROKE_IDS_PER_TEAM} stroke ids per room`;
	}

	return null;
}

function projectVisibleDrawing(state: DrawingState): DrawingDocument {
	return {
		strokesById: {
			...state.document.strokesById,
			...state.inProgressById,
		},
		strokeOrder: [...state.document.strokeOrder, ...state.inProgressOrder],
	};
}

function getDrawingHistoryCapabilities(state: DrawingState): DrawingHistoryCapabilities {
	const hasInProgressStroke = state.inProgressOrder.length > 0;
	return {
		canUndo: !hasInProgressStroke && state.history.past.length > 0,
		canRedo: !hasInProgressStroke && state.history.future.length > 0,
	};
}

function createSnapshotEvent(room: StoredRoomState, member: StoredMember | undefined): TypedRoomSnapshotServerEvent {
	return createTypedSnapshotEvent(member === undefined ? { kind: 'awaiting-join' } : createDrawingRoomSnapshot(room, member));
}

function createTypedSnapshotEvent(state: RoomSnapshotState): TypedRoomSnapshotServerEvent {
	if (state.kind === 'awaiting-join') {
		return { type: 'room.snapshot', state };
	}

	return { type: 'room.snapshot', state };
}

function createDrawingRoomSnapshot(room: StoredRoomState, member: StoredMember): RoomSnapshotState {
	return {
		kind: 'drawing-room',
		phase: room.phase,
		viewer: {
			playerId: member.sessionId,
			team: member.team,
			role: member.role,
		},
		teamDrawing: projectVisibleDrawing(room.teamDrawings[member.team]),
		...getDrawingHistoryCapabilities(room.teamDrawings[member.team]),
	};
}

function createEmptyRoomState(): StoredRoomState {
	return {
		version: PROTOCOL_VERSION,
		roomSeq: 0,
		phase: 'drawing',
		members: {},
		teamDrawings: {
			A: createDrawingState({ historyLimit: DRAWING_HISTORY_LIMIT }),
			B: createDrawingState({ historyLimit: DRAWING_HISTORY_LIMIT }),
		},
		acceptedClientSeqBySession: {},
		recentCommandIds: [],
	};
}

function normalizeStoredRoom(value: StoredRoomState | undefined, legacyRoomSeq?: number): StoredRoomState {
	if (value === undefined) {
		const room = createEmptyRoomState();
		return {
			...room,
			roomSeq: normalizeLegacyRoomSequence(legacyRoomSeq),
		};
	}

	const acceptedClientSeqBySession = value.acceptedClientSeqBySession ?? {};
	const recentCommandIds = value.recentCommandIds ?? [];

	if (
		value.version !== PROTOCOL_VERSION ||
		value.phase !== 'drawing' ||
		!Number.isSafeInteger(value.roomSeq) ||
		value.roomSeq < 0 ||
		typeof value.members !== 'object' ||
		value.members === null ||
		typeof value.teamDrawings !== 'object' ||
		value.teamDrawings === null ||
		value.teamDrawings.A === undefined ||
		value.teamDrawings.B === undefined ||
		!isSequenceRecord(acceptedClientSeqBySession) ||
		!Array.isArray(recentCommandIds) ||
		!recentCommandIds.every((commandId) => typeof commandId === 'string')
	) {
		throw new Error('Stored room state is invalid');
	}

	return {
		...value,
		acceptedClientSeqBySession,
		recentCommandIds: recentCommandIds.slice(-MAX_RECENT_COMMANDS),
	};
}

function getDrawers(room: StoredRoomState): Readonly<Record<TeamId, string>> | null {
	const members = Object.values(room.members);
	const drawerA = members.find((member) => member.team === 'A' && member.role === 'drawer');
	const drawerB = members.find((member) => member.team === 'B' && member.role === 'drawer');

	return drawerA === undefined || drawerB === undefined ? null : { A: drawerA.sessionId, B: drawerB.sessionId };
}

function chooseTeam(members: readonly StoredMember[], preferredTeam: TeamId | undefined): TeamId | null {
	const teamACount = members.filter((member) => member.team === 'A').length;
	const teamBCount = members.length - teamACount;

	if (preferredTeam === 'A') {
		return teamACount < MAX_TEAM_MEMBERS ? 'A' : null;
	}

	if (preferredTeam === 'B') {
		return teamBCount < MAX_TEAM_MEMBERS ? 'B' : null;
	}

	if (teamACount >= MAX_TEAM_MEMBERS) {
		return teamBCount < MAX_TEAM_MEMBERS ? 'B' : null;
	}

	if (teamBCount >= MAX_TEAM_MEMBERS) {
		return 'A';
	}

	return teamACount <= teamBCount ? 'A' : 'B';
}

function otherTeam(team: TeamId): TeamId {
	return team === 'A' ? 'B' : 'A';
}

function createServerEnvelope(roomCode: string, roomSeq: number, event: OutboundServerEvent): ServerEventEnvelopeV1 {
	return {
		version: PROTOCOL_VERSION,
		roomCode,
		roomSeq,
		serverTimeMs: Date.now(),
		event: event as ServerEvent,
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

async function commandSignatureHash(envelope: CommandEnvelopeV1): Promise<string> {
	const semanticCommand = JSON.stringify({
		sessionId: envelope.sessionId,
		roomCode: envelope.roomCode,
		clientSeq: envelope.clientSeq,
		command: envelope.command,
	});
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(semanticCommand));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readAttachment(ws: WebSocket): ConnectionAttachment | null {
	const value = ws.deserializeAttachment();

	if (typeof value !== 'object' || value === null) {
		return null;
	}

	const attachment = value as Partial<ConnectionAttachment>;
	const roomCode = roomCodeSchema.safeParse(attachment.roomCode);
	const sessionId = sessionIdSchema.safeParse(attachment.sessionId);
	const hasAudience = attachment.team !== undefined || attachment.role !== undefined;

	if (
		attachment.version !== PROTOCOL_VERSION ||
		!roomCode.success ||
		!sessionId.success ||
		(attachment.superseded !== undefined && attachment.superseded !== true) ||
		(hasAudience && (!isTeamId(attachment.team) || !isPlayerRole(attachment.role)))
	) {
		return null;
	}

	return hasAudience
		? {
				version: PROTOCOL_VERSION,
				roomCode: roomCode.data,
				sessionId: sessionId.data,
				team: attachment.team as TeamId,
				role: attachment.role as PlayerRole,
				...(attachment.superseded === true ? { superseded: true as const } : {}),
			}
		: {
				version: PROTOCOL_VERSION,
				roomCode: roomCode.data,
				sessionId: sessionId.data,
				...(attachment.superseded === true ? { superseded: true as const } : {}),
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

function isTeamId(value: unknown): value is TeamId {
	return value === 'A' || value === 'B';
}

function isPlayerRole(value: unknown): value is PlayerRole {
	return value === 'drawer' || value === 'guesser';
}

function encodedByteLength(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function getOwnRecordValue<Value>(record: Readonly<Record<string, Value>>, key: string): Value | undefined {
	return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function isSequenceRecord(value: unknown): value is Readonly<Record<string, number>> {
	return (
		typeof value === 'object' && value !== null && Object.values(value).every((sequence) => Number.isSafeInteger(sequence) && sequence > 0)
	);
}

function normalizeLegacyRoomSequence(value: number | undefined): number {
	if (value === undefined) return 0;
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error('Stored legacy room sequence is invalid');
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
	return jsonResponse({ error: 'Method not allowed' }, 405, {
		Allow: allowedMethod,
	});
}

function upgradeRequired(): Response {
	return jsonResponse({ error: 'WebSocket upgrade required' }, 426, {
		Upgrade: 'websocket',
	});
}

class MessageTooLargeError extends Error {}
