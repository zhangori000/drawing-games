import {
	PROTOCOL_VERSION,
	parseDrawingDomainEvent,
	parseRoomSnapshotState,
	parseServerEventEnvelopeV1,
	type CommandEnvelopeV1,
	type DrawingRoomSnapshot,
	type RoomSnapshotState,
	type ServerEventEnvelopeV1,
} from '@drawing-games/protocol';
import { exports as workerExports } from 'cloudflare:workers';
import { env, evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('realtime Worker router', () => {
	it('reports health without caching', async () => {
		const response = await workerExports.default.fetch(new Request('https://example.com/health'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(await response.json()).toEqual({ status: 'ok' });
	});

	it('rejects unknown routes and unsupported methods', async () => {
		const missing = await workerExports.default.fetch(new Request('https://example.com/nope'));
		const wrongMethod = await workerExports.default.fetch(new Request('https://example.com/health', { method: 'POST' }));

		expect(missing.status).toBe(404);
		expect(wrongMethod.status).toBe(405);
		expect(wrongMethod.headers.get('Allow')).toBe('GET');
	});

	it('requires a valid WebSocket upgrade, room code, and session id', async () => {
		const notAnUpgrade = await workerExports.default.fetch(new Request('https://example.com/rooms/ABCD/socket?sessionId=session_1'));
		const badRoom = await workerExports.default.fetch(webSocketRequest('https://example.com/rooms/ABC/socket?sessionId=session_1'));
		const badSession = await workerExports.default.fetch(webSocketRequest('https://example.com/rooms/ABCD/socket?sessionId=not%20opaque'));

		expect(notAnUpgrade.status).toBe(426);
		expect(notAnUpgrade.headers.get('Upgrade')).toBe('websocket');
		expect(badRoom.status).toBe(400);
		expect(badSession.status).toBe(400);
	});
});

describe('authoritative drawing room', () => {
	it('starts unknown sessions awaiting join and assigns one drawer per team', async () => {
		const roomCode = 'ROLE1';
		const aDrawer = await openSocket(roomCode, 'role_a_drawer');
		const bDrawer = await openSocket(roomCode, 'role_b_drawer');
		const aGuesser = await openSocket(roomCode, 'role_a_guesser');
		const bGuesser = await openSocket(roomCode, 'role_b_guesser');
		const sockets = [aDrawer, bDrawer, aGuesser, bGuesser];

		try {
			for (const connection of sockets) {
				expect(snapshotState(connection.snapshot)).toEqual({
					kind: 'awaiting-join',
				});
			}

			const [aDrawerState, bDrawerState, aGuesserState, bGuesserState] = await Promise.all([
				joinPlayer(aDrawer, 'A Drawer', 'A', 1),
				joinPlayer(bDrawer, 'B Drawer', 'B', 1),
				joinPlayer(aGuesser, 'A Guesser', 'A', 1),
				joinPlayer(bGuesser, 'B Guesser', 'B', 1),
			]);

			expect(aDrawerState.viewer).toEqual({
				playerId: 'role_a_drawer',
				team: 'A',
				role: 'drawer',
			});
			expect(bDrawerState.viewer).toEqual({
				playerId: 'role_b_drawer',
				team: 'B',
				role: 'drawer',
			});
			expect(aGuesserState.viewer.role).toBe('guesser');
			expect(bGuesserState.viewer.role).toBe('guesser');
		} finally {
			closeConnections(sockets);
		}
	});

	it('balances players without a preference and caps a room at 16 members', async () => {
		const roomCode = 'FULL1';
		const connections: OpenSocketResult[] = [];

		try {
			for (let index = 0; index < 17; index += 1) {
				connections.push(await openSocket(roomCode, `full_${index}`));
			}

			const first = await joinPlayer(connections[0] as OpenSocketResult, 'Player 0', undefined, 1);
			const second = await joinPlayer(connections[1] as OpenSocketResult, 'Player 1', undefined, 1);
			expect(first.viewer.team).toBe('A');
			expect(second.viewer.team).toBe('B');

			for (let index = 2; index < 16; index += 1) {
				await joinPlayer(connections[index] as OpenSocketResult, `Player ${index}`, undefined, 1);
			}

			const last = connections[16] as OpenSocketResult;
			const errorMessage = nextServerEvent(last.socket);
			last.socket.send(
				JSON.stringify(
					commandEnvelope({
						roomCode,
						sessionId: 'full_16',
						commandId: 'join_full_16',
						clientSeq: 1,
						command: {
							type: 'room.join',
							displayName: 'Player 16',
						},
					}),
				),
			);

			expect(await errorMessage).toMatchObject({
				roomSeq: 16,
				event: {
					type: 'protocol.error',
					code: 'ROOM_FULL',
					commandId: 'join_full_16',
				},
			});
		} finally {
			closeConnections(connections);
		}
	});

	it('rejects a ninth preferred teammate while preserving room capacity for the other team', async () => {
		const roomCode = 'CAPA1';
		const connections: OpenSocketResult[] = [];

		try {
			for (let index = 0; index < 10; index += 1) {
				connections.push(await openSocket(roomCode, `cap_${index}`));
			}

			for (let index = 0; index < 8; index += 1) {
				await joinPlayer(connections[index] as OpenSocketResult, `Team A ${index}`, 'A', 1);
			}

			const rejected = connections[8] as OpenSocketResult;
			const errorMessage = nextServerEvent(rejected.socket);
			rejected.socket.send(
				JSON.stringify(
					commandEnvelope({
						roomCode,
						sessionId: rejected.sessionId,
						commandId: 'join_cap_8',
						clientSeq: 1,
						command: {
							type: 'room.join',
							displayName: 'Ninth A',
							preferredTeam: 'A',
						},
					}),
				),
			);
			expect(await errorMessage).toMatchObject({
				roomSeq: 8,
				event: { type: 'protocol.error', code: 'ROOM_FULL' },
			});

			const bState = await joinPlayer(connections[9] as OpenSocketResult, 'Team B Drawer', 'B', 1);
			expect(bState.viewer).toMatchObject({ team: 'B', role: 'drawer' });
		} finally {
			closeConnections(connections);
		}
	});

	it('keeps only one live socket for a session', async () => {
		const first = await openSocket('SOCK1', 'single_socket_session');
		let second: OpenSocketResult | null = null;

		try {
			await joinPlayer(first, 'Single Socket', 'A', 1);
			const firstClosed = nextSocketClose(first.socket);
			second = await openSocket('SOCK1', 'single_socket_session');

			expect(await firstClosed).toEqual({
				code: 4005,
				reason: 'Session opened elsewhere',
			});
			expect(joinedSnapshotState(second.snapshot).viewer).toMatchObject({
				playerId: 'single_socket_session',
				team: 'A',
				role: 'drawer',
			});
		} finally {
			first.socket.close(1000, 'test complete');
			second?.socket.close(1000, 'test complete');
		}
	});

	it('rejects a superseded socket command queued behind session takeover', async () => {
		const room = await createRoomWithPlayers('TAKE1', [
			['takeover_a_drawer', 'A Drawer', 'A'],
			['takeover_b_drawer', 'B Drawer', 'B'],
		]);
		const oldSocket = room.bySession.takeover_a_drawer as OpenSocketResult;

		try {
			const applied = nextServerEvents(oldSocket.socket, 2);
			oldSocket.socket.send(
				JSON.stringify(drawingCommand('TAKE1', 'takeover_a_drawer', 'takeover_initial', 2, tapStroke('survives_takeover'))),
			);
			await applied;

			const stub = env.GAME_ROOM.getByName('TAKE1');
			const result = await runInDurableObject(stub, async (instance, state) => {
				const oldServerSocket = state.getWebSockets().find((socket) => {
					const attachment = socket.deserializeAttachment() as {
						sessionId?: unknown;
					};
					return attachment?.sessionId === 'takeover_a_drawer';
				});
				if (oldServerSocket === undefined) {
					throw new Error('Expected the original server socket');
				}

				const internalUrl = new URL('https://game-room.internal/socket');
				internalUrl.searchParams.set('roomCode', 'TAKE1');
				internalUrl.searchParams.set('sessionId', 'takeover_a_drawer');
				const admission = instance.fetch(webSocketRequest(internalUrl.toString()));
				const staleCommand = instance.webSocketMessage(
					oldServerSocket,
					JSON.stringify(drawingCommand('TAKE1', 'takeover_a_drawer', 'stale_clear_after_takeover', 99, [{ type: 'drawing.clear' }])),
				);

				const response = await admission;
				response.webSocket?.accept();
				await staleCommand;
				response.webSocket?.close(1000, 'test complete');
				const storedRoom = await state.storage.get<{
					roomSeq: number;
					teamDrawings: {
						A: { document: { strokeOrder: readonly string[] } };
					};
				}>('roomState');
				return {
					roomSeq: storedRoom?.roomSeq,
					strokeOrder: storedRoom?.teamDrawings.A.document.strokeOrder ?? [],
				};
			});

			expect(result).toEqual({
				roomSeq: 3,
				strokeOrder: ['survives_takeover'],
			});
		} finally {
			closeConnections(room.connections);
		}
	});

	it('handles prototype-like session ids as ordinary room members', async () => {
		const room = await createRoomWithPlayers('OWN01', [
			['constructor', 'Constructor', 'A'],
			['__proto__', 'Prototype', 'B'],
			['toString', 'String Guesser', 'A'],
		]);

		try {
			const drawer = room.bySession.constructor as OpenSocketResult;
			const messages = nextServerEvents(drawer.socket, 2);
			drawer.socket.send(
				JSON.stringify(drawingCommand('OWN01', 'constructor', 'prototype_safe_draw', 2, tapStroke('prototype_safe_stroke'))),
			);
			const [drawing, ack] = await messages;
			expect(drawingDomainEvent(drawing as ServerEventEnvelopeV1)).toMatchObject({
				payload: {
					document: { strokeOrder: ['prototype_safe_stroke'] },
				},
			});
			expect(ack).toMatchObject({
				event: { type: 'command.ack', status: 'applied' },
			});
		} finally {
			closeConnections(room.connections);
		}
	});

	it('stores a command hash and compact effect descriptor without the raw command', async () => {
		const connection = await openSocket('HASH1', 'hash_session');

		try {
			await joinPlayer(connection, 'Sensitive Display Name', 'A', 1);
			const stub = env.GAME_ROOM.getByName('HASH1');
			const stored = await runInDurableObject(stub, (_instance, state) => state.storage.get('commands-v2/join_hash_session_1'));
			const serialized = JSON.stringify(stored);

			expect(stored).toMatchObject({
				sessionId: 'hash_session',
				clientSeq: 1,
				signatureHash: expect.stringMatching(/^[0-9a-f]{64}$/),
				effect: { kind: 'snapshot' },
				recoveryReplayCount: 0,
			});
			expect(serialized).not.toContain('Sensitive Display Name');
			expect(serialized).not.toContain('room.join');
			expect(serialized).not.toContain('"signature"');
		} finally {
			connection.socket.close(1000, 'test complete');
		}
	});

	it('migrates the legacy sequence and command namespace on the first accepted command', async () => {
		const stub = env.GAME_ROOM.getByName('MIGR1');
		await runInDurableObject(stub, async (_instance, state) => {
			await state.storage.put('roomSeq', 41);
			await state.storage.put('commands/legacy_collision', {
				sessionId: 'legacy_session',
				clientSeq: 1,
				signature: 'legacy raw command signature',
			});
		});

		const connection = await openSocket('MIGR1', 'legacy_session');
		try {
			expect(connection.snapshot).toMatchObject({
				roomSeq: 41,
				event: {
					type: 'room.snapshot',
					state: { kind: 'awaiting-join' },
				},
			});

			const messages = nextServerEvents(connection.socket, 2);
			connection.socket.send(
				JSON.stringify(
					commandEnvelope({
						roomCode: 'MIGR1',
						sessionId: 'legacy_session',
						commandId: 'legacy_collision',
						clientSeq: 1,
						command: {
							type: 'room.join',
							displayName: 'Migrated Player',
							preferredTeam: 'A',
						},
					}),
				),
			);
			const [snapshot, ack] = await messages;
			expect(snapshot).toMatchObject({
				roomSeq: 42,
				event: { type: 'room.snapshot' },
			});
			expect(ack).toMatchObject({
				roomSeq: 42,
				event: { type: 'command.ack', status: 'applied' },
			});

			const migrated = await runInDurableObject(stub, async (_instance, state) => ({
				room: await state.storage.get<{ roomSeq: number }>('roomState'),
				legacySequence: await state.storage.get('roomSeq'),
				legacyCommand: await state.storage.get('commands/legacy_collision'),
				currentCommand: await state.storage.get('commands-v2/legacy_collision'),
			}));
			expect(migrated.room?.roomSeq).toBe(42);
			expect(migrated.legacySequence).toBeUndefined();
			expect(migrated.legacyCommand).toBeUndefined();
			expect(migrated.currentCommand).toBeDefined();
		} finally {
			connection.socket.close(1000, 'test complete');
		}
	});

	it('rejects a guesser without mutating the team drawing', async () => {
		const room = await createRoomWithPlayers('DENY1', [
			['deny_a_drawer', 'A Drawer', 'A'],
			['deny_b_drawer', 'B Drawer', 'B'],
			['deny_a_guesser', 'A Guesser', 'A'],
		]);

		try {
			const guesser = room.bySession.deny_a_guesser as OpenSocketResult;
			const errorMessage = nextServerEvent(guesser.socket);
			guesser.socket.send(JSON.stringify(drawingCommand('DENY1', 'deny_a_guesser', 'deny_draw', 2, tapStroke('forbidden'))));

			expect(await errorMessage).toMatchObject({
				roomSeq: 3,
				event: {
					type: 'protocol.error',
					code: 'NOT_ALLOWED',
					commandId: 'deny_draw',
					details: { reason: 'not-current-drawer' },
				},
			});

			const resumed = await openSocket('DENY1', 'deny_a_guesser');
			try {
				const state = joinedSnapshotState(resumed.snapshot);
				expect(state.teamDrawing.strokeOrder).toEqual([]);
			} finally {
				resumed.socket.close(1000, 'test complete');
			}
		} finally {
			closeConnections(room.connections);
		}
	});

	it('acks only the sender, publishes vectors to its team, and sends opponents activity only', async () => {
		const room = await createRoomWithPlayers('ISO01', [
			['iso_a_drawer', 'A Drawer', 'A'],
			['iso_b_drawer', 'B Drawer', 'B'],
			['iso_a_guesser', 'A Guesser', 'A'],
		]);

		try {
			const sender = room.bySession.iso_a_drawer as OpenSocketResult;
			const teammate = room.bySession.iso_a_guesser as OpenSocketResult;
			const opponent = room.bySession.iso_b_drawer as OpenSocketResult;
			const senderMessages = nextServerEvents(sender.socket, 2);
			const teammateMessage = nextServerEvent(teammate.socket);
			const opponentMessage = nextServerEvent(opponent.socket);

			sender.socket.send(JSON.stringify(drawingCommand('ISO01', 'iso_a_drawer', 'iso_stroke', 2, stroke('iso_vector'))));

			const [senderEvents, teammateEvent, opponentEvent] = await Promise.all([senderMessages, teammateMessage, opponentMessage]);
			expect(senderEvents[1]).toMatchObject({
				event: {
					type: 'command.ack',
					commandId: 'iso_stroke',
					status: 'applied',
				},
			});

			for (const event of [senderEvents[0], teammateEvent]) {
				const drawingEvent = drawingDomainEvent(event as ServerEventEnvelopeV1);
				expect(drawingEvent).toMatchObject({
					name: 'drawing.document',
					payload: {
						team: 'A',
						document: { strokeOrder: ['iso_vector'] },
						canUndo: true,
						canRedo: false,
					},
				});
			}

			const activity = drawingDomainEvent(opponentEvent);
			expect(activity).toEqual({
				type: 'domain.event',
				name: 'drawing.opponent-activity',
				payload: { team: 'A', active: true },
			});
			expect(JSON.stringify(opponentEvent)).not.toContain('iso_vector');
			expect(JSON.stringify(opponentEvent)).not.toContain('points');
		} finally {
			closeConnections(room.connections);
		}
	});

	it('publishes an in-progress stroke before pointer-up for low-latency drawing', async () => {
		const room = await createRoomWithPlayers('LIVE1', [
			['live_a_drawer', 'A Drawer', 'A'],
			['live_b_drawer', 'B Drawer', 'B'],
		]);

		try {
			const drawer = room.bySession.live_a_drawer as OpenSocketResult;
			const beginMessages = nextServerEvents(drawer.socket, 2);
			drawer.socket.send(JSON.stringify(drawingCommand('LIVE1', 'live_a_drawer', 'live_begin', 2, [beginStroke('live_vector')])));
			const [beginProjection] = await beginMessages;
			expect(drawingDomainEvent(beginProjection as ServerEventEnvelopeV1)).toMatchObject({
				payload: {
					canUndo: false,
					canRedo: false,
					document: {
						strokeOrder: ['live_vector'],
						strokesById: {
							live_vector: { points: [{ x: 0.2, y: 0.3 }] },
						},
					},
				},
			});

			const endMessages = nextServerEvents(drawer.socket, 2);
			drawer.socket.send(
				JSON.stringify(
					drawingCommand('LIVE1', 'live_a_drawer', 'live_end', 3, [
						{
							type: 'stroke.end',
							strokeId: 'live_vector',
							pointCount: 1,
						},
					]),
				),
			);
			const [endProjection] = await endMessages;
			expect(drawingDomainEvent(endProjection as ServerEventEnvelopeV1)).toMatchObject({
				payload: {
					document: { strokeOrder: ['live_vector'] },
					canUndo: true,
					canRedo: false,
				},
			});
		} finally {
			closeConnections(room.connections);
		}
	});

	it('applies a duplicate drawing command exactly once', async () => {
		const room = await createRoomWithPlayers('DUPL1', [
			['duplicate_a_drawer', 'A Drawer', 'A'],
			['duplicate_b_drawer', 'B Drawer', 'B'],
			['duplicate_a_guesser', 'A Guesser', 'A'],
		]);

		try {
			const sender = room.bySession.duplicate_a_drawer as OpenSocketResult;
			const teammate = room.bySession.duplicate_a_guesser as OpenSocketResult;
			const opponent = room.bySession.duplicate_b_drawer as OpenSocketResult;
			const command = drawingCommand('DUPL1', 'duplicate_a_drawer', 'duplicate_stroke', 2, tapStroke('only_once'));
			const firstSender = nextServerEvents(sender.socket, 2);
			const firstTeammate = nextServerEvent(teammate.socket);
			const firstOpponent = nextServerEvent(opponent.socket);
			sender.socket.send(JSON.stringify(command));
			await Promise.all([firstSender, firstTeammate, firstOpponent]);

			const clearSender = nextServerEvents(sender.socket, 2);
			const clearTeammate = nextServerEvent(teammate.socket);
			const clearOpponent = nextServerEvent(opponent.socket);
			sender.socket.send(
				JSON.stringify(drawingCommand('DUPL1', 'duplicate_a_drawer', 'clear_after_original', 3, [{ type: 'drawing.clear' }])),
			);
			await Promise.all([clearSender, clearTeammate, clearOpponent]);

			const senderReplayMessages = nextServerEvents(sender.socket, 2);
			const teammateReplayMessage = nextServerEvent(teammate.socket);
			const opponentReplayWindow = collectServerEvents(opponent.socket, 80);
			sender.socket.send(JSON.stringify(command));
			const [senderReplay, teammateReplay, opponentReplay] = await Promise.all([
				senderReplayMessages,
				teammateReplayMessage,
				opponentReplayWindow,
			]);

			expect(drawingDomainEvent(senderReplay[0] as ServerEventEnvelopeV1)).toMatchObject({
				payload: { document: { strokeOrder: [] } },
			});
			expect(senderReplay[0]).toMatchObject({ roomSeq: 5 });
			expect(senderReplay[1]).toMatchObject({
				roomSeq: 4,
				event: {
					type: 'command.ack',
					commandId: 'duplicate_stroke',
					status: 'duplicate',
				},
			});
			expect(drawingDomainEvent(teammateReplay)).toMatchObject({
				name: 'drawing.document',
				payload: { document: { strokeOrder: [] } },
			});
			expect(teammateReplay).toMatchObject({ roomSeq: 5 });
			expect(opponentReplay).toEqual([]);

			const senderSecondReplay = collectServerEvents(sender.socket, 80);
			const teammateSecondReplay = collectServerEvents(teammate.socket, 80);
			const opponentSecondReplay = collectServerEvents(opponent.socket, 80);
			sender.socket.send(JSON.stringify(command));
			const [senderSecond, teammateSecond, opponentSecond] = await Promise.all([
				senderSecondReplay,
				teammateSecondReplay,
				opponentSecondReplay,
			]);
			expect(senderSecond).toHaveLength(1);
			expect(senderSecond[0]).toMatchObject({
				roomSeq: 4,
				event: { type: 'command.ack', status: 'duplicate' },
			});
			expect(teammateSecond).toEqual([]);
			expect(opponentSecond).toEqual([]);

			const resumed = await openSocket('DUPL1', 'duplicate_a_guesser');
			try {
				expect(joinedSnapshotState(resumed.snapshot).teamDrawing.strokeOrder).toEqual([]);
			} finally {
				resumed.socket.close(1000, 'test complete');
			}
		} finally {
			closeConnections(room.connections);
		}
	});

	it('rejects an unseen client sequence below the accepted session high-water mark', async () => {
		const room = await createRoomWithPlayers('SEQH1', [
			['sequence_a_drawer', 'A Drawer', 'A'],
			['sequence_b_drawer', 'B Drawer', 'B'],
		]);

		try {
			const drawer = room.bySession.sequence_a_drawer as OpenSocketResult;
			const appliedMessages = nextServerEvents(drawer.socket, 2);
			drawer.socket.send(JSON.stringify(drawingCommand('SEQH1', 'sequence_a_drawer', 'sequence_three', 3, tapStroke('newer_stroke'))));
			await appliedMessages;

			const staleMessage = nextServerEvent(drawer.socket);
			drawer.socket.send(JSON.stringify(drawingCommand('SEQH1', 'sequence_a_drawer', 'sequence_two_late', 2, [{ type: 'drawing.clear' }])));
			expect(await staleMessage).toMatchObject({
				roomSeq: 3,
				event: {
					type: 'protocol.error',
					code: 'STALE_CLIENT',
					commandId: 'sequence_two_late',
					details: { acceptedClientSeq: 3 },
				},
			});

			const reconnected = await openSocket('SEQH1', 'sequence_a_drawer');
			try {
				expect(joinedSnapshotState(reconnected.snapshot).teamDrawing.strokeOrder).toEqual(['newer_stroke']);
			} finally {
				reconnected.socket.close(1000, 'test complete');
			}
		} finally {
			closeConnections(room.connections);
		}
	});

	it('evicts command records beyond the bounded replay window and rejects their stale retries', async () => {
		const room = await createRoomWithPlayers('RING1', [
			['ring_a', 'A Drawer', 'A'],
			['ring_b', 'B Drawer', 'B'],
		]);
		const stub = env.GAME_ROOM.getByName('RING1');

		try {
			await runInDurableObject(stub, async (_instance, state) => {
				const storedRoom = await state.storage.get<Record<string, unknown>>('roomState');
				if (storedRoom === undefined) throw new Error('Expected room state');
				await state.storage.put('roomState', {
					...storedRoom,
					recentCommandIds: ['join_ring_a_1', 'join_ring_b_1', ...Array.from({ length: 510 }, (_, index) => `seed_${index}`)],
				});
			});

			const drawer = room.bySession.ring_a as OpenSocketResult;
			const resumeMessages = nextServerEvents(drawer.socket, 2);
			drawer.socket.send(
				JSON.stringify(
					commandEnvelope({
						roomCode: 'RING1',
						sessionId: 'ring_a',
						commandId: 'ring_resume',
						clientSeq: 2,
						command: { type: 'room.resume' },
					}),
				),
			);
			const [, resumeAck] = await resumeMessages;
			expect(resumeAck).toMatchObject({
				event: { type: 'command.ack', status: 'applied' },
			});

			const retention = await runInDurableObject(stub, async (_instance, state) => {
				const storedRoom = await state.storage.get<{
					recentCommandIds: readonly string[];
				}>('roomState');
				return {
					recentCommandIds: storedRoom?.recentCommandIds ?? [],
					evicted: await state.storage.get('commands-v2/join_ring_a_1'),
				};
			});
			expect(retention.recentCommandIds).toHaveLength(512);
			expect(retention.recentCommandIds.at(-1)).toBe('ring_resume');
			expect(retention.evicted).toBeUndefined();

			const staleRetry = nextServerEvent(drawer.socket);
			drawer.socket.send(
				JSON.stringify(
					commandEnvelope({
						roomCode: 'RING1',
						sessionId: 'ring_a',
						commandId: 'join_ring_a_1',
						clientSeq: 1,
						command: {
							type: 'room.join',
							displayName: 'A Drawer',
							preferredTeam: 'A',
						},
					}),
				),
			);
			expect(await staleRetry).toMatchObject({
				roomSeq: 3,
				event: { type: 'protocol.error', code: 'STALE_CLIENT' },
			});
		} finally {
			closeConnections(room.connections);
		}
	});

	it('rejects an out-of-order append atomically', async () => {
		const room = await createRoomWithPlayers('ORDER1', [
			['order_a_drawer', 'A Drawer', 'A'],
			['order_b_drawer', 'B Drawer', 'B'],
		]);

		try {
			const drawer = room.bySession.order_a_drawer as OpenSocketResult;
			const rejectedMessage = nextServerEvent(drawer.socket);
			drawer.socket.send(
				JSON.stringify(
					drawingCommand('ORDER1', 'order_a_drawer', 'bad_order', 2, [
						beginStroke('atomic_stroke'),
						{
							type: 'stroke.append',
							strokeId: 'atomic_stroke',
							startPointIndex: 99,
							points: [{ x: 0.4, y: 0.4 }],
						},
					]),
				),
			);

			expect(await rejectedMessage).toMatchObject({
				roomSeq: 2,
				event: {
					type: 'protocol.error',
					code: 'BAD_COMMAND',
					commandId: 'bad_order',
				},
			});

			// Reusing the stroke id succeeds only if the earlier begin was rolled back.
			const acceptedMessages = nextServerEvents(drawer.socket, 2);
			drawer.socket.send(JSON.stringify(drawingCommand('ORDER1', 'order_a_drawer', 'good_order', 3, tapStroke('atomic_stroke'))));
			const accepted = await acceptedMessages;
			expect(accepted[1]).toMatchObject({
				roomSeq: 3,
				event: { type: 'command.ack', status: 'applied' },
			});
			expect(drawingDomainEvent(accepted[0] as ServerEventEnvelopeV1)).toMatchObject({
				payload: { document: { strokeOrder: ['atomic_stroke'] } },
			});
		} finally {
			closeConnections(room.connections);
		}
	});

	it('restores role-scoped vectors after reconnect and actor eviction', async () => {
		const room = await createRoomWithPlayers('EVICT1', [
			['evict_a_drawer', 'A Drawer', 'A'],
			['evict_b_drawer', 'B Drawer', 'B'],
		]);

		try {
			const drawer = room.bySession.evict_a_drawer as OpenSocketResult;
			const applied = nextServerEvents(drawer.socket, 2);
			drawer.socket.send(JSON.stringify(drawingCommand('EVICT1', 'evict_a_drawer', 'before_eviction', 2, tapStroke('durable_vector'))));
			await applied;
		} finally {
			closeConnections(room.connections);
		}

		const stub = env.GAME_ROOM.getByName('EVICT1');
		await evictDurableObject(stub, { webSockets: 'close' });

		const aReconnected = await openSocket('evict1', 'evict_a_drawer');
		const bReconnected = await openSocket('EVICT1', 'evict_b_drawer');
		const stranger = await openSocket('EVICT1', 'evict_stranger');

		try {
			const aState = joinedSnapshotState(aReconnected.snapshot);
			const bState = joinedSnapshotState(bReconnected.snapshot);
			expect(aState.viewer).toMatchObject({ team: 'A', role: 'drawer' });
			expect(aState.teamDrawing.strokeOrder).toEqual(['durable_vector']);
			expect(bState.viewer).toMatchObject({ team: 'B', role: 'drawer' });
			expect(bState.teamDrawing.strokeOrder).toEqual([]);
			expect(snapshotState(stranger.snapshot)).toEqual({
				kind: 'awaiting-join',
			});
			expect(JSON.stringify(bReconnected.snapshot)).not.toContain('durable_vector');
		} finally {
			closeConnections([aReconnected, bReconnected, stranger]);
		}
	});

	it('persists undo, redo, clear, and undo-clear as authoritative operations', async () => {
		const room = await createRoomWithPlayers('HIST1', [
			['history_a_drawer', 'A Drawer', 'A'],
			['history_b_drawer', 'B Drawer', 'B'],
		]);

		try {
			const drawer = room.bySession.history_a_drawer as OpenSocketResult;
			await expectDrawingOrder(
				drawer,
				drawingCommand('HIST1', 'history_a_drawer', 'history_stroke', 2, tapStroke('history_vector')),
				['history_vector'],
				{ canUndo: true, canRedo: false },
			);
			await expectDrawingOrder(drawer, drawingCommand('HIST1', 'history_a_drawer', 'history_undo', 3, [{ type: 'drawing.undo' }]), [], {
				canUndo: false,
				canRedo: true,
			});
			await expectDrawingOrder(
				drawer,
				drawingCommand('HIST1', 'history_a_drawer', 'history_redo', 4, [{ type: 'drawing.redo' }]),
				['history_vector'],
				{ canUndo: true, canRedo: false },
			);
			await expectDrawingOrder(drawer, drawingCommand('HIST1', 'history_a_drawer', 'history_clear', 5, [{ type: 'drawing.clear' }]), [], {
				canUndo: true,
				canRedo: false,
			});
			await expectDrawingOrder(
				drawer,
				drawingCommand('HIST1', 'history_a_drawer', 'history_undo_clear', 6, [{ type: 'drawing.undo' }]),
				['history_vector'],
				{ canUndo: true, canRedo: true },
			);
		} finally {
			closeConnections(room.connections);
		}
	});

	it('rejects malformed protocol input without advancing room state', async () => {
		const connection = await openSocket('BADJ1', 'bad_json_session');

		try {
			const errorMessage = nextServerEvent(connection.socket);
			connection.socket.send('{definitely-not-json');

			expect(await errorMessage).toMatchObject({
				roomSeq: 0,
				event: {
					type: 'protocol.error',
					code: 'BAD_COMMAND',
					retryable: false,
				},
			});
		} finally {
			connection.socket.close(1000, 'test complete');
		}
	});
});

interface OpenSocketResult {
	readonly socket: WebSocket;
	readonly snapshot: ServerEventEnvelopeV1;
	readonly roomCode: string;
	readonly sessionId: string;
}

interface RoomFixture {
	readonly connections: readonly OpenSocketResult[];
	readonly bySession: Readonly<Record<string, OpenSocketResult>>;
}

type PlayerFixture = readonly [sessionId: string, displayName: string, team: 'A' | 'B'];

async function createRoomWithPlayers(roomCode: string, players: readonly PlayerFixture[]): Promise<RoomFixture> {
	const connections: OpenSocketResult[] = [];
	const bySession = Object.create(null) as Record<string, OpenSocketResult>;

	for (const [sessionId, displayName, team] of players) {
		const connection = await openSocket(roomCode, sessionId);
		connections.push(connection);
		bySession[sessionId] = connection;
		await joinPlayer(connection, displayName, team, 1);
	}

	return { connections, bySession };
}

async function joinPlayer(
	connection: OpenSocketResult,
	displayName: string,
	preferredTeam: 'A' | 'B' | undefined,
	clientSeq: number,
): Promise<DrawingRoomSnapshot> {
	const messages = nextServerEvents(connection.socket, 2);
	connection.socket.send(
		JSON.stringify(
			commandEnvelope({
				roomCode: connection.roomCode,
				sessionId: connection.sessionId,
				commandId: `join_${connection.sessionId}_${clientSeq}`,
				clientSeq,
				command: {
					type: 'room.join',
					displayName,
					...(preferredTeam === undefined ? {} : { preferredTeam }),
				},
			}),
		),
	);
	const [snapshot, ack] = await messages;
	expect(ack).toMatchObject({
		event: {
			type: 'command.ack',
			status: 'applied',
		},
	});
	return joinedSnapshotState(snapshot as ServerEventEnvelopeV1);
}

async function expectDrawingOrder(
	connection: OpenSocketResult,
	command: CommandEnvelopeV1,
	expectedOrder: readonly string[],
	expectedCapabilities: {
		readonly canUndo: boolean;
		readonly canRedo: boolean;
	},
): Promise<void> {
	const messages = nextServerEvents(connection.socket, 2);
	connection.socket.send(JSON.stringify(command));
	const [drawing, ack] = await messages;
	expect(ack?.event).toMatchObject({ type: 'command.ack', status: 'applied' });
	expect(drawingDomainEvent(drawing as ServerEventEnvelopeV1)).toMatchObject({
		name: 'drawing.document',
		payload: {
			document: { strokeOrder: expectedOrder },
			...expectedCapabilities,
		},
	});
}

async function openSocket(roomCode: string, sessionId: string): Promise<OpenSocketResult> {
	const normalizedRoomCode = roomCode.toUpperCase();
	const url = new URL(`https://example.com/rooms/${roomCode}/socket`);
	url.searchParams.set('sessionId', sessionId);
	const response = await workerExports.default.fetch(webSocketRequest(url.toString()));

	expect(response.status).toBe(101);
	const socket = response.webSocket;

	if (socket === null) {
		throw new Error('Expected a WebSocket response');
	}

	const snapshotMessage = nextServerEvent(socket);
	socket.accept();
	return {
		socket,
		snapshot: await snapshotMessage,
		roomCode: normalizedRoomCode,
		sessionId,
	};
}

function nextServerEvent(socket: WebSocket): Promise<ServerEventEnvelopeV1> {
	return nextServerEvents(socket, 1).then(([event]) => {
		if (event === undefined) {
			throw new Error('Expected a server event');
		}

		return event;
	});
}

function nextServerEvents(socket: WebSocket, count: number): Promise<readonly ServerEventEnvelopeV1[]> {
	return new Promise((resolve, reject) => {
		const events: ServerEventEnvelopeV1[] = [];
		const onMessage = (event: MessageEvent) => {
			try {
				events.push(parseSocketEvent(event));

				if (events.length === count) {
					socket.removeEventListener('message', onMessage);
					resolve(events);
				}
			} catch (error) {
				socket.removeEventListener('message', onMessage);
				reject(error);
			}
		};

		socket.addEventListener('message', onMessage);
	});
}

function nextSocketClose(socket: WebSocket): Promise<{ readonly code: number; readonly reason: string }> {
	return new Promise((resolve) => {
		socket.addEventListener('close', (event) => resolve({ code: event.code, reason: event.reason }), { once: true });
	});
}

function collectServerEvents(socket: WebSocket, durationMs: number): Promise<readonly ServerEventEnvelopeV1[]> {
	return new Promise((resolve, reject) => {
		const events: ServerEventEnvelopeV1[] = [];
		const onMessage = (event: MessageEvent) => {
			try {
				events.push(parseSocketEvent(event));
			} catch (error) {
				clearTimeout(timer);
				socket.removeEventListener('message', onMessage);
				reject(error);
			}
		};
		const timer = setTimeout(() => {
			socket.removeEventListener('message', onMessage);
			resolve(events);
		}, durationMs);

		socket.addEventListener('message', onMessage);
	});
}

function parseSocketEvent(event: MessageEvent): ServerEventEnvelopeV1 {
	const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : JSON.parse(new TextDecoder().decode(event.data));
	return parseServerEventEnvelopeV1(parsed);
}

function snapshotState(envelope: ServerEventEnvelopeV1): RoomSnapshotState {
	if (envelope.event.type !== 'room.snapshot') {
		throw new Error(`Expected room.snapshot, received ${envelope.event.type}`);
	}

	return parseRoomSnapshotState(envelope.event.state);
}

function joinedSnapshotState(envelope: ServerEventEnvelopeV1): DrawingRoomSnapshot {
	const state = snapshotState(envelope);

	if (state.kind !== 'drawing-room') {
		throw new Error('Expected a joined drawing-room snapshot');
	}

	return state;
}

function drawingDomainEvent(envelope: ServerEventEnvelopeV1) {
	if (envelope.event.type !== 'domain.event') {
		throw new Error(`Expected domain.event, received ${envelope.event.type}`);
	}

	return parseDrawingDomainEvent(envelope.event);
}

function webSocketRequest(url: string): Request {
	return new Request(url, { headers: { Upgrade: 'websocket' } });
}

function commandEnvelope(input: {
	readonly roomCode: string;
	readonly sessionId: string;
	readonly commandId: string;
	readonly clientSeq: number;
	readonly command: CommandEnvelopeV1['command'];
}): CommandEnvelopeV1 {
	return {
		version: PROTOCOL_VERSION,
		lastRoomSeq: 0,
		...input,
	};
}

function drawingCommand(
	roomCode: string,
	sessionId: string,
	commandId: string,
	clientSeq: number,
	operations: Extract<CommandEnvelopeV1['command'], { type: 'drawing.batch' }>['operations'],
): CommandEnvelopeV1 {
	return commandEnvelope({
		roomCode,
		sessionId,
		commandId,
		clientSeq,
		command: { type: 'drawing.batch', operations },
	});
}

function beginStroke(strokeId: string) {
	return {
		type: 'stroke.begin' as const,
		strokeId,
		point: { x: 0.2, y: 0.3 },
		style: { color: '#112233', width: 0.01, opacity: 1 },
	};
}

function tapStroke(strokeId: string) {
	return [beginStroke(strokeId), { type: 'stroke.end' as const, strokeId, pointCount: 1 }];
}

function stroke(strokeId: string) {
	return [
		beginStroke(strokeId),
		{
			type: 'stroke.append' as const,
			strokeId,
			startPointIndex: 1,
			points: [
				{ x: 0.3, y: 0.4, pressure: 0.5 },
				{ x: 0.5, y: 0.6, pressure: 0.8 },
			],
		},
		{ type: 'stroke.end' as const, strokeId, pointCount: 3 },
	];
}

function closeConnections(connections: readonly OpenSocketResult[]): void {
	for (const connection of connections) {
		connection.socket.close(1000, 'test complete');
	}
}
