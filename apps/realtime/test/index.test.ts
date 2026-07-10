import { PROTOCOL_VERSION, parseServerEventEnvelopeV1, type CommandEnvelopeV1, type ServerEventEnvelopeV1 } from '@drawing-games/protocol';
import { exports as workerExports } from 'cloudflare:workers';
import { env, evictDurableObject } from 'cloudflare:test';
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

describe('GameRoom WebSocket protocol', () => {
	it('normalizes the room and starts with a role-neutral snapshot', async () => {
		const connection = await openSocket('snap1', 'session_snapshot');

		try {
			expect(connection.snapshot).toMatchObject({
				version: PROTOCOL_VERSION,
				roomCode: 'SNAP1',
				roomSeq: 0,
				event: {
					type: 'room.snapshot',
					state: { phase: 'lobby' },
				},
			});
			expect(connection.snapshot.event).not.toHaveProperty('role');
			expect(connection.snapshot.event).not.toHaveProperty('word');
		} finally {
			connection.socket.close(1000, 'test complete');
		}
	});

	it('persists an applied ack before broadcast and reuses its sequence for a duplicate', async () => {
		const first = await openSocket('retry1', 'session_retry');
		const command = commandEnvelope({
			roomCode: 'RETRY1',
			sessionId: 'session_retry',
			commandId: 'command_retry',
			clientSeq: 1,
			lastRoomSeq: 0,
		});

		try {
			const appliedMessage = nextServerEvent(first.socket);
			first.socket.send(JSON.stringify(command));
			const applied = await appliedMessage;

			expect(applied).toMatchObject({
				roomCode: 'RETRY1',
				roomSeq: 1,
				event: {
					type: 'command.ack',
					commandId: 'command_retry',
					clientSeq: 1,
					status: 'applied',
				},
			});

			// A new connection using different room-code casing reaches the same DO.
			const reconnected = await openSocket('RETRY1', 'session_retry');
			try {
				expect(reconnected.snapshot.roomSeq).toBe(1);

				const duplicateMessage = nextServerEvent(reconnected.socket);
				reconnected.socket.send(JSON.stringify(command));
				const duplicate = await duplicateMessage;

				expect(duplicate).toMatchObject({
					roomCode: 'RETRY1',
					roomSeq: 1,
					event: {
						type: 'command.ack',
						commandId: 'command_retry',
						clientSeq: 1,
						status: 'duplicate',
					},
				});
			} finally {
				reconnected.socket.close(1000, 'test complete');
			}
		} finally {
			first.socket.close(1000, 'test complete');
		}
	});

	it('allocates monotonically increasing room sequences', async () => {
		const connection = await openSocket('seq01', 'session_sequence');

		try {
			const firstMessage = nextServerEvent(connection.socket);
			connection.socket.send(
				JSON.stringify(
					commandEnvelope({
						roomCode: 'SEQ01',
						sessionId: 'session_sequence',
						commandId: 'command_one',
						clientSeq: 1,
						lastRoomSeq: 0,
					}),
				),
			);
			expect((await firstMessage).roomSeq).toBe(1);

			const secondMessage = nextServerEvent(connection.socket);
			connection.socket.send(
				JSON.stringify(
					commandEnvelope({
						roomCode: 'SEQ01',
						sessionId: 'session_sequence',
						commandId: 'command_two',
						clientSeq: 2,
						lastRoomSeq: 1,
					}),
				),
			);
			expect((await secondMessage).roomSeq).toBe(2);
		} finally {
			connection.socket.close(1000, 'test complete');
		}
	});

	it('restores committed room state after the Durable Object is evicted', async () => {
		const connection = await openSocket('evict1', 'session_eviction');

		try {
			const appliedMessage = nextServerEvent(connection.socket);
			connection.socket.send(
				JSON.stringify(
					commandEnvelope({
						roomCode: 'EVICT1',
						sessionId: 'session_eviction',
						commandId: 'command_before_eviction',
						clientSeq: 1,
						lastRoomSeq: 0,
					}),
				),
			);

			expect((await appliedMessage).roomSeq).toBe(1);
		} finally {
			connection.socket.close(1000, 'prepare actor eviction');
		}

		const stub = env.GAME_ROOM.getByName('EVICT1');
		await evictDurableObject(stub, { webSockets: 'close' });

		const reconnected = await openSocket('EVICT1', 'session_eviction');
		try {
			expect(reconnected.snapshot.roomSeq).toBe(1);
		} finally {
			reconnected.socket.close(1000, 'test complete');
		}
	});

	it('broadcasts an applied ack to every connection in the room', async () => {
		const sender = await openSocket('bcast1', 'session_sender');
		const observer = await openSocket('BCAST1', 'session_observer');

		try {
			const senderMessage = nextServerEvent(sender.socket);
			const observerMessage = nextServerEvent(observer.socket);
			sender.socket.send(
				JSON.stringify(
					commandEnvelope({
						roomCode: 'BCAST1',
						sessionId: 'session_sender',
						commandId: 'command_broadcast',
						clientSeq: 1,
						lastRoomSeq: 0,
					}),
				),
			);

			const [senderAck, observerAck] = await Promise.all([senderMessage, observerMessage]);
			expect(senderAck).toEqual(observerAck);
			expect(senderAck).toMatchObject({
				roomSeq: 1,
				event: { type: 'command.ack', status: 'applied' },
			});
		} finally {
			sender.socket.close(1000, 'test complete');
			observer.socket.close(1000, 'test complete');
		}
	});

	it('rejects commandId reuse with different semantic command data', async () => {
		const connection = await openSocket('conf1', 'session_conflict');
		const original = commandEnvelope({
			roomCode: 'CONF1',
			sessionId: 'session_conflict',
			commandId: 'command_conflict',
			clientSeq: 1,
			lastRoomSeq: 0,
		});

		try {
			const appliedMessage = nextServerEvent(connection.socket);
			connection.socket.send(JSON.stringify(original));
			expect((await appliedMessage).event).toMatchObject({ status: 'applied' });

			const conflictMessage = nextServerEvent(connection.socket);
			connection.socket.send(
				JSON.stringify({
					...original,
					command: { type: 'room.join', displayName: 'Different command' },
				}),
			);

			expect(await conflictMessage).toMatchObject({
				roomSeq: 1,
				event: {
					type: 'protocol.error',
					code: 'BAD_COMMAND',
					commandId: 'command_conflict',
				},
			});
		} finally {
			connection.socket.close(1000, 'test complete');
		}
	});

	it('rejects commands whose identity does not match the connection attachment', async () => {
		const connection = await openSocket('ident1', 'session_identity');

		try {
			const errorMessage = nextServerEvent(connection.socket);
			connection.socket.send(
				JSON.stringify(
					commandEnvelope({
						roomCode: 'OTHER1',
						sessionId: 'session_identity',
						commandId: 'command_wrong_room',
						clientSeq: 1,
						lastRoomSeq: 0,
					}),
				),
			);

			expect(await errorMessage).toMatchObject({
				roomCode: 'IDENT1',
				roomSeq: 0,
				event: {
					type: 'protocol.error',
					code: 'UNAUTHORIZED',
					retryable: false,
					commandId: 'command_wrong_room',
				},
			});
		} finally {
			connection.socket.close(1000, 'test complete');
		}
	});

	it('returns a safe protocol error for malformed JSON', async () => {
		const connection = await openSocket('badj1', 'session_bad_json');

		try {
			const errorMessage = nextServerEvent(connection.socket);
			connection.socket.send('{definitely-not-json');

			expect(await errorMessage).toMatchObject({
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
}

async function openSocket(roomCode: string, sessionId: string): Promise<OpenSocketResult> {
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
	return { socket, snapshot: await snapshotMessage };
}

function nextServerEvent(socket: WebSocket): Promise<ServerEventEnvelopeV1> {
	return new Promise((resolve, reject) => {
		socket.addEventListener(
			'message',
			(event) => {
				try {
					const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : JSON.parse(new TextDecoder().decode(event.data));
					resolve(parseServerEventEnvelopeV1(parsed));
				} catch (error) {
					reject(error);
				}
			},
			{ once: true },
		);
	});
}

function webSocketRequest(url: string): Request {
	return new Request(url, { headers: { Upgrade: 'websocket' } });
}

function commandEnvelope(input: {
	readonly roomCode: string;
	readonly sessionId: string;
	readonly commandId: string;
	readonly clientSeq: number;
	readonly lastRoomSeq: number;
}): CommandEnvelopeV1 {
	return {
		version: PROTOCOL_VERSION,
		...input,
		command: { type: 'room.resume' },
	};
}
