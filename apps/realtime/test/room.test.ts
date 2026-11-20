import { env, evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { createRoom, fetchWorker, joinRoom, randomCommandId, resumeRoom, RoomSocket, run } from './room/harness';

describe('room routes', () => {
	it('creates a room with a 5-character code and reports its info', async () => {
		const response = await fetchWorker('/rooms', { method: 'POST' });
		expect(response.status).toBe(201);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		const { roomCode } = (await response.json()) as { roomCode: string };
		expect(roomCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);

		const info = await fetchWorker(`/rooms/${roomCode.toLowerCase()}`);
		expect(info.status).toBe(200);
		expect(await info.json()).toEqual({ exists: true, phase: 'lobby', memberCount: 0 });

		const host = await joinRoom(roomCode, 'Ana');
		try {
			expect(await (await fetchWorker(`/rooms/${roomCode}`)).json()).toMatchObject({ exists: true, memberCount: 1 });
		} finally {
			host.close();
		}
	});

	it('reports unknown rooms as missing without creating them', async () => {
		const info = await fetchWorker('/rooms/ZZZZ9');
		expect(info.status).toBe(200);
		expect(await info.json()).toEqual({ exists: false, phase: null, memberCount: 0 });
		const tables = await runInDurableObject(env.GAME_ROOM.getByName('ZZZZ9'), (_instance, state) =>
			state.storage.sql
				.exec<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'`)
				.toArray(),
		);
		expect(tables).toEqual([]);
	});

	it('validates methods and codes', async () => {
		expect((await fetchWorker('/rooms')).status).toBe(405);
		expect((await fetchWorker('/rooms/ABCDE', { method: 'POST' })).status).toBe(405);
		expect((await fetchWorker('/rooms/not-a-code!')).status).toBe(400);
	});

	it('refuses to create the same code twice', async () => {
		const roomCode = await createRoom();
		expect(await env.GAME_ROOM.getByName(roomCode).create(roomCode)).toBe(false);
	});

	it('closes sockets to a room that was never created with ROOM_NOT_FOUND / 4404', async () => {
		const client = await RoomSocket.open('NOPE7');
		expect(await client.error()).toMatchObject({ code: 'ROOM_NOT_FOUND', retryable: false });
		expect((await client.closed).code).toBe(4404);

		// The refused socket is the runtime's (hibernatable, no attachment), so
		// it never counts as a member and the code stays free to create.
		const stub = env.GAME_ROOM.getByName('NOPE7');
		const tables = await runInDurableObject(stub, (_instance, state) =>
			state.storage.sql
				.exec<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'`)
				.toArray(),
		);
		expect(tables).toEqual([]);
		expect(await stub.create('NOPE7')).toBe(true);
		expect(await stub.info()).toEqual({ exists: true, phase: 'lobby', memberCount: 0 });
	});
});

describe('room handshake', () => {
	it('issues a private session and then a snapshot on join', async () => {
		const roomCode = await createRoom();
		const client = await RoomSocket.open(roomCode);
		try {
			const commandId = client.send({ type: 'room.join', displayName: '  Ana   Banana ' });
			const session = await client.domain('session.issued');
			expect(session.memberId).toMatch(/^m_[A-Za-z0-9_-]{12}$/);
			expect(session.resumeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
			expect((await client.ack(commandId)).event.status).toBe('applied');
			const view = await client.view();
			expect(view.me).toMatchObject({ memberId: session.memberId, isHost: true, team: 'A', role: 'idle' });
			expect(view.members).toEqual([expect.objectContaining({ id: session.memberId, displayName: 'Ana Banana' })]);

			// Only the hash of the resume token is stored.
			const stored = await runInDurableObject(env.GAME_ROOM.getByName(roomCode), (_instance, state) =>
				state.storage.sql.exec<{ token_hash: string; member_id: string }>('SELECT token_hash, member_id FROM sessions').toArray(),
			);
			expect(stored).toHaveLength(1);
			expect(stored[0]?.member_id).toBe(session.memberId);
			expect(stored[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
			expect(stored[0]?.token_hash).not.toContain(session.resumeToken);
		} finally {
			client.close();
		}
	});

	it('gives each member a view with their own role and team', async () => {
		const roomCode = await createRoom();
		const ana = await joinRoom(roomCode, 'Ana');
		const ben = await joinRoom(roomCode, 'Ben');
		try {
			const benView = await ben.view();
			const anaView = await ana.view((view) => view.members.length === 2, 'two members');
			expect(anaView.me).toMatchObject({ memberId: ana.memberId, isHost: true, team: 'A' });
			expect(benView.me).toMatchObject({ memberId: ben.memberId, isHost: false, team: 'B' });
			expect(anaView.members.map((member) => member.id)).toEqual([ana.memberId, ben.memberId]);
			expect(anaView.lobby?.blockers).toContain('Waiting for Ben to ready up');
		} finally {
			ana.close();
			ben.close();
		}
	});

	it('requires join or resume before any other command', async () => {
		const roomCode = await createRoom();
		const client = await RoomSocket.open(roomCode);
		try {
			const commandId = client.send({ type: 'lobby.ready', ready: true });
			expect(await client.error(commandId)).toMatchObject({ code: 'UNAUTHORIZED', retryable: false });
			const joined = client.send({ type: 'room.join', displayName: 'Ana' });
			await client.ack(joined);
			const again = client.send({ type: 'room.join', displayName: 'Ana' });
			expect(await client.error(again)).toMatchObject({ code: 'BAD_COMMAND' });
		} finally {
			client.close();
		}
	});

	it('resumes the same member after the socket closes', async () => {
		const roomCode = await createRoom();
		const first = await joinRoom(roomCode, 'Ana');
		const watcher = await joinRoom(roomCode, 'Ben');
		first.close();
		// The room completes the closing handshake.
		expect((await first.closed).code).toBe(1000);
		const offline = await watcher.view((view) => view.members.some((m) => m.id === first.memberId && !m.connected), 'Ana offline');
		expect(offline.members).toHaveLength(2);

		const resumed = await resumeRoom(roomCode, first.resumeToken ?? '');
		try {
			expect(resumed.memberId).toBe(first.memberId);
			expect(resumed.resumeToken).toBe(first.resumeToken);
			expect((await resumed.view()).me?.memberId).toBe(first.memberId);
			await watcher.view((view) => view.members.some((m) => m.id === first.memberId && m.connected), 'Ana back');
		} finally {
			resumed.close();
			watcher.close();
		}
	});

	it('resumes the same member after the Durable Object is evicted', async () => {
		const roomCode = await createRoom();
		const first = await joinRoom(roomCode, 'Ana');
		await run(first, { type: 'lobby.bot.add', team: 'B' });
		await evictDurableObject(env.GAME_ROOM.getByName(roomCode), { webSockets: 'close' });
		await first.closed;

		const resumed = await resumeRoom(roomCode, first.resumeToken ?? '');
		try {
			expect(resumed.memberId).toBe(first.memberId);
			const view = await resumed.view();
			expect(view.me).toMatchObject({ memberId: first.memberId, isHost: true });
			expect(view.members.map((member) => member.kind)).toEqual(['human', 'bot']);
			expect(view.members[0]?.connected).toBe(true);
		} finally {
			resumed.close();
		}
	});

	it('rejects an unknown resume token with UNAUTHORIZED', async () => {
		const roomCode = await createRoom();
		const client = await RoomSocket.open(roomCode);
		try {
			const withToken = client.send({ type: 'room.resume', resumeToken: 'not-a-real-token-0123456789' });
			expect(await client.error(withToken)).toMatchObject({ code: 'UNAUTHORIZED', retryable: false, commandId: withToken });
			const withoutToken = client.send({ type: 'room.resume' });
			expect(await client.error(withoutToken)).toMatchObject({ code: 'UNAUTHORIZED', retryable: false });
		} finally {
			client.close();
		}
	});

	it('rejects the token of a member who left the lobby', async () => {
		const roomCode = await createRoom();
		const host = await joinRoom(roomCode, 'Ana');
		const leaver = await joinRoom(roomCode, 'Ben');
		try {
			await run(leaver, { type: 'room.leave' });
			leaver.close();
			await host.view((view) => view.members.length === 1, 'Ben gone');
			const retry = await RoomSocket.open(roomCode);
			const commandId = retry.send({ type: 'room.resume', resumeToken: leaver.resumeToken ?? '' });
			expect(await retry.error(commandId)).toMatchObject({ code: 'UNAUTHORIZED' });
			retry.close();
		} finally {
			host.close();
		}
	});

	it('closes the older socket with 4001 when the same member connects again', async () => {
		const roomCode = await createRoom();
		const first = await joinRoom(roomCode, 'Ana');
		const second = await resumeRoom(roomCode, first.resumeToken ?? '');
		try {
			expect(await first.closed).toEqual({ code: 4001, reason: 'Replaced by a newer connection' });
			const view = await second.view();
			expect(view.members).toHaveLength(1);
			expect(view.members[0]?.connected).toBe(true);
			// The replaced socket's close does not mark the member offline.
			await run(second, { type: 'lobby.bot.add', team: 'B' });
			expect((await second.latestView()).members[0]?.connected).toBe(true);
		} finally {
			second.close();
		}
	});

	it('closes the socket of a member the host removes', async () => {
		const roomCode = await createRoom();
		const host = await joinRoom(roomCode, 'Ana');
		const guest = await joinRoom(roomCode, 'Ben');
		try {
			await run(host, { type: 'lobby.member.remove', memberId: guest.memberId ?? '' });
			expect((await guest.closed).code).toBe(4003);
		} finally {
			host.close();
		}
	});
});

describe('room commands', () => {
	it('applies a duplicate commandId once and answers with a duplicate ack', async () => {
		const roomCode = await createRoom();
		const host = await joinRoom(roomCode, 'Ana');
		try {
			const commandId = randomCommandId();
			host.send({ type: 'lobby.bot.add', team: 'B' }, { commandId, clientSeq: 50 });
			const applied = await host.ack(commandId);
			expect(applied.event.status).toBe('applied');
			await host.view((view) => view.members.length === 2, 'bot added');

			host.send({ type: 'lobby.bot.add', team: 'B' }, { commandId, clientSeq: 50 });
			const duplicate = await host.ack(commandId);
			expect(duplicate.event.status).toBe('duplicate');
			expect(duplicate.roomSeq).toBe(applied.roomSeq);

			await host.barrier();
			const info = (await (await fetchWorker(`/rooms/${roomCode}`)).json()) as { memberCount: number };
			expect(info.memberCount).toBe(2);

			// Reusing the id for a different command is refused.
			host.send({ type: 'lobby.bot.add', team: 'A' }, { commandId, clientSeq: 51 });
			expect(await host.error(commandId)).toMatchObject({ code: 'BAD_COMMAND' });
		} finally {
			host.close();
		}
	});

	it('maps reducer rejections to protocol errors', async () => {
		const roomCode = await createRoom();
		const host = await joinRoom(roomCode, 'Ana');
		const guest = await joinRoom(roomCode, 'Ben');
		try {
			const start = guest.send({ type: 'match.start' });
			expect(await guest.error(start)).toMatchObject({ code: 'NOT_ALLOWED', retryable: false, commandId: start });
			const early = host.send({ type: 'match.start' });
			expect(await host.error(early)).toMatchObject({ code: 'NOT_ALLOWED', message: expect.stringContaining('needs at least 2 players') });
		} finally {
			host.close();
			guest.close();
		}
	});
});
