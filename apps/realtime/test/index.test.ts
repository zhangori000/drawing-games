import { exports as workerExports } from 'cloudflare:workers';
import { env, evictDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { messageTooLargeDetailsSchema } from '@drawing-games/protocol';

import { createRoom, joinRoom, randomCommandId, resumeRoom, RoomSocket } from './room/harness';

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
		const twoSessions = await workerExports.default.fetch(
			webSocketRequest('https://example.com/rooms/ABCD/socket?sessionId=session_1&sessionId=session_2'),
		);

		expect(notAnUpgrade.status).toBe(426);
		expect(notAnUpgrade.headers.get('Upgrade')).toBe('websocket');
		expect(badRoom.status).toBe(400);
		expect(badSession.status).toBe(400);
		expect(twoSessions.status).toBe(400);
	});
});

describe('GameRoom WebSocket protocol', () => {
	it('stays silent and unbound until the first room.join or room.resume', async () => {
		const roomCode = await createRoom();
		const client = await RoomSocket.open(roomCode);

		try {
			const commandId = client.send({ type: 'lobby.ready', ready: true });
			const error = await client.error(commandId);
			expect(error).toMatchObject({ code: 'UNAUTHORIZED', retryable: false, commandId });
			// Anything sent before that error would already be queued.
			expect(client.has((envelope) => envelope.event.type === 'room.snapshot')).toBe(false);
		} finally {
			client.close();
		}
	});

	it('persists an applied ack and replays it, with its sequence, for a retried commandId', async () => {
		const roomCode = await createRoom();
		const first = await joinRoom(roomCode, 'Ana');
		const commandId = randomCommandId();

		try {
			first.send({ type: 'lobby.bot.add', team: 'B' }, { commandId, clientSeq: 7 });
			const applied = await first.ack(commandId);
			expect(applied).toMatchObject({ roomCode, event: { type: 'command.ack', commandId, clientSeq: 7, status: 'applied' } });
			const view = await first.view((candidate) => candidate.members.length === 2, 'bot joined');
			expect(applied.roomSeq).toBe(view.seq);
		} finally {
			first.close();
		}

		// A new connection using different room-code casing reaches the same room.
		const reconnected = await resumeRoom(roomCode.toLowerCase(), first.resumeToken ?? '');
		try {
			reconnected.send({ type: 'lobby.bot.add', team: 'B' }, { commandId, clientSeq: 7 });
			const duplicate = await reconnected.ack(commandId);
			expect(duplicate.event).toMatchObject({ commandId, clientSeq: 7, status: 'duplicate' });
			expect((await reconnected.view()).members).toHaveLength(2);
		} finally {
			reconnected.close();
		}
	});

	it('allocates monotonically increasing room sequences', async () => {
		const roomCode = await createRoom();
		const client = await joinRoom(roomCode, 'Ana');

		try {
			const first = await client.ack(client.send({ type: 'lobby.bot.add', team: 'A' }));
			const second = await client.ack(client.send({ type: 'lobby.bot.add', team: 'B' }));
			expect(second.roomSeq).toBeGreaterThan(first.roomSeq);
		} finally {
			client.close();
		}
	});

	it('restores committed room state after the Durable Object is evicted', async () => {
		const roomCode = await createRoom();
		const client = await joinRoom(roomCode, 'Ana');
		const applied = await client.ack(client.send({ type: 'lobby.bot.add', team: 'B' }));

		await evictDurableObject(env.GAME_ROOM.getByName(roomCode), { webSockets: 'close' });
		await client.closed;

		const reconnected = await resumeRoom(roomCode, client.resumeToken ?? '');
		try {
			const view = await reconnected.view();
			expect(view.seq).toBeGreaterThanOrEqual(applied.roomSeq);
			expect(view.members.map((member) => member.displayName)).toEqual(['Ana', 'Pixel Pete']);
		} finally {
			reconnected.close();
		}
	});

	it('acks only the sender while every member gets a fresh view', async () => {
		const roomCode = await createRoom();
		const sender = await joinRoom(roomCode, 'Ana');
		const observer = await joinRoom(roomCode, 'Ben');

		try {
			const commandId = sender.send({ type: 'lobby.bot.add', team: 'B' });
			await sender.ack(commandId);
			const [senderView, observerView] = await Promise.all([
				sender.view((view) => view.members.length === 3, 'bot for sender'),
				observer.view((view) => view.members.length === 3, 'bot for observer'),
			]);
			expect(senderView.members).toEqual(observerView.members);
			expect(senderView.me?.memberId).not.toBe(observerView.me?.memberId);
			await observer.barrier();
			expect(observer.has((envelope) => envelope.event.type === 'command.ack' && envelope.event.commandId === commandId)).toBe(false);
		} finally {
			sender.close();
			observer.close();
		}
	});

	it('rejects commandId reuse with different semantic command data', async () => {
		const roomCode = await createRoom();
		const client = await joinRoom(roomCode, 'Ana');
		const commandId = randomCommandId();

		try {
			client.send({ type: 'lobby.bot.add', team: 'B' }, { commandId, clientSeq: 3 });
			expect((await client.ack(commandId)).event.status).toBe('applied');

			client.send({ type: 'lobby.bot.add', team: 'A' }, { commandId, clientSeq: 3 });
			expect(await client.error(commandId)).toMatchObject({ code: 'BAD_COMMAND', commandId, retryable: false });
		} finally {
			client.close();
		}
	});

	it('rejects commands whose identity does not match the connection', async () => {
		const roomCode = await createRoom();
		const client = await RoomSocket.open(roomCode);

		try {
			const commandId = randomCommandId();
			client.sendRaw(
				JSON.stringify({
					version: 1,
					commandId,
					sessionId: 'someone_else',
					roomCode,
					clientSeq: 1,
					lastRoomSeq: 0,
					command: { type: 'room.join', displayName: 'Mallory' },
				}),
			);
			expect(await client.error(commandId)).toMatchObject({ code: 'UNAUTHORIZED', retryable: false, commandId });
		} finally {
			client.close();
		}
	});

	it('returns a safe protocol error for malformed JSON and envelopes', async () => {
		const roomCode = await createRoom();
		const client = await RoomSocket.open(roomCode);

		try {
			client.sendRaw('{definitely-not-json');
			const notJson = await client.error();
			expect(notJson).toMatchObject({ code: 'BAD_COMMAND', retryable: false });
			expect(notJson).not.toHaveProperty('commandId');
			// Unparseable, but its id is readable from the start: the error names it.
			client.sendRaw('{"version":1,"commandId":"c_cut","sessionId":"s');
			expect(await client.error('c_cut')).toMatchObject({ code: 'BAD_COMMAND', retryable: false, commandId: 'c_cut' });
			client.sendRaw(JSON.stringify({ version: 1, commandId: 'c_bad', command: { type: 'nope' } }));
			expect(await client.error('c_bad')).toMatchObject({ code: 'BAD_COMMAND', retryable: false });
		} finally {
			client.close();
		}
	});

	it('closes the socket with 1009 when a message exceeds 64 KiB', async () => {
		const roomCode = await createRoom();
		const client = await RoomSocket.open(roomCode);

		client.sendRaw(JSON.stringify({ padding: 'x'.repeat(64 * 1024) }));
		const error = await client.error();
		expect(error).toMatchObject({ code: 'BAD_COMMAND', details: { reason: 'message-too-large', maxBytes: 64 * 1024 } });
		expect(error).not.toHaveProperty('commandId');
		expect(messageTooLargeDetailsSchema.safeParse(error.details).success).toBe(true);
		expect((await client.closed).code).toBe(1009);
	});

	it('names the oversized command when its id leads the message', async () => {
		const roomCode = await createRoom();
		const client = await RoomSocket.open(roomCode);
		const commandId = randomCommandId();

		client.sendRaw(
			JSON.stringify({
				version: 1,
				commandId,
				sessionId: client.sessionId,
				roomCode,
				clientSeq: 1,
				lastRoomSeq: 0,
				command: { type: 'guess.submit', text: 'x'.repeat(64 * 1024) },
			}),
		);
		expect(await client.error(commandId)).toMatchObject({
			code: 'BAD_COMMAND',
			commandId,
			retryable: false,
			details: { reason: 'message-too-large' },
		});
		expect((await client.closed).code).toBe(1009);
	});
});

function webSocketRequest(url: string): Request {
	return new Request(url, { headers: { Upgrade: 'websocket' } });
}
