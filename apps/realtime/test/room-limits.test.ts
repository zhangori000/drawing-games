import type { DrawingAction } from '@drawing-games/drawing-model';
import type { ClientCommand, ErrorServerEvent } from '@drawing-games/protocol';
import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMMAND_RATE_LIMITS, HANDSHAKE_TIMEOUT_MS, IDLE_ROOM_TTL_MS } from '../src/room/constants';
import { closeAll, createRoom, joinRoom, resumeRoom, RoomSocket, run, type Envelope } from './room/harness';

function stroke(id: string): DrawingAction[] {
	return [
		{ type: 'stroke.begin', strokeId: id, point: { x: 0.2, y: 0.2 }, style: { color: '#112233', width: 0.02, opacity: 1 } },
		{ type: 'stroke.append', strokeId: id, startPointIndex: 1, points: [{ x: 0.5, y: 0.6 }] },
		{ type: 'stroke.end', strokeId: id, pointCount: 2 },
	];
}

/** Sends every command at once (no waiting in between) and collects each answer. */
async function flood(client: RoomSocket, commands: readonly ClientCommand[]): Promise<{ ids: string[]; outcomes: Envelope[] }> {
	const ids = commands.map((command) => client.send(command));
	const outcomes = await Promise.all(
		ids.map((id) =>
			client.next(
				(e) => (e.event.type === 'command.ack' || e.event.type === 'protocol.error') && e.event.commandId === id,
				`outcome ${id}`,
			),
		),
	);
	return { ids, outcomes };
}

function refusals(outcomes: readonly Envelope[]): ErrorServerEvent[] {
	return outcomes.flatMap((e) => (e.event.type === 'protocol.error' ? [e.event] : []));
}

function openSocketCount(roomCode: string): Promise<number> {
	return runInDurableObject(
		env.GAME_ROOM.getByName(roomCode),
		(_instance, state) => state.getWebSockets().filter((ws) => ws.readyState === 1).length,
	);
}

const isView = (e: Envelope) => e.event.type === 'room.snapshot';

// Time is frozen in every test: budgets refill only when a test moves the clock.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
});

afterEach(() => {
	vi.useRealTimers();
});

describe('room command budgets', { timeout: 30_000 }, () => {
	it('refuses a command flood with a retryable RATE_LIMITED, applying and fanning out only what fits', async () => {
		const roomCode = await createRoom();
		const host = await joinRoom(roomCode, 'Ana');
		const guest = await joinRoom(roomCode, 'Ben');
		try {
			await host.barrier();
			host.clearInbox();
			const { capacity } = COMMAND_RATE_LIMITS.control;
			const toggles: ClientCommand[] = Array.from({ length: capacity + 10 }, (_, index) => ({
				type: 'lobby.ready',
				ready: index % 2 === 0,
			}));
			const { ids, outcomes } = await flood(guest, toggles);

			expect(outcomes.filter((e) => e.event.type === 'command.ack')).toHaveLength(capacity);
			const refused = refusals(outcomes);
			expect(refused).toHaveLength(10);
			for (const error of refused) {
				expect(error).toMatchObject({ code: 'RATE_LIMITED', retryable: true, details: { retryAfterMs: 200 } });
			}
			// The host saw one view per applied toggle, none for refused ones.
			await host.barrier();
			expect(host.count(isView)).toBe(capacity);

			// Reconnecting does not refill the member's budget (the handshake
			// itself is charged to the new socket).
			const resumed = await resumeRoom(roomCode, guest.resumeToken ?? '');
			const blocked = resumed.send({ type: 'lobby.ready', ready: true });
			expect(await resumed.error(blocked)).toMatchObject({ code: 'RATE_LIMITED' });

			// Refused commands were neither applied nor logged: once the budget
			// refills, the same commandId is applied, not answered as a duplicate.
			vi.setSystemTime(Date.now() + 1_000);
			const firstRefused = refused[0]?.commandId ?? '';
			const index = ids.indexOf(firstRefused);
			resumed.send(toggles[index] as ClientCommand, { commandId: firstRefused });
			expect((await resumed.ack(firstRefused)).event.status).toBe('applied');
			closeAll(resumed);
		} finally {
			closeAll(host, guest);
		}
	});

	it('gives drawing batches their own, larger budget', async () => {
		const roomCode = await createRoom();
		const stub = env.GAME_ROOM.getByName(roomCode);
		const host = await joinRoom(roomCode, 'Dru');
		try {
			for (const team of ['A', 'B', 'B'] as const) await run(host, { type: 'lobby.bot.add', team });
			await run(host, { type: 'match.start' });
			const draft = await host.view((view) => view.phase === 'word-draft', 'draft');
			const pick = draft.round?.mine?.options?.[0];
			if (pick === undefined) throw new Error('the host should be drawing first');
			await run(host, { type: 'draft.select', optionId: pick.wordId });
			// Let the bot drawer reach its pick.
			vi.setSystemTime((draft.phaseDeadlineAtMs ?? 0) - 1);
			expect(await runDurableObjectAlarm(stub)).toBe(true);
			await host.view((view) => view.phase === 'drawing', 'drawing');

			const first: ClientCommand = { type: 'drawing.batch', operations: stroke('first') };
			const firstId = host.send(first, { commandId: 'c_first_batch', clientSeq: 10_000 });
			expect((await host.ack(firstId)).event.status).toBe('applied');

			const { capacity } = COMMAND_RATE_LIMITS.drawing;
			const batches: ClientCommand[] = Array.from({ length: capacity + 4 }, (_, index) => ({
				type: 'drawing.batch',
				operations: stroke(`f${index}`),
			}));
			const { outcomes } = await flood(host, batches);
			expect(outcomes.filter((e) => e.event.type === 'command.ack')).toHaveLength(capacity - 1);
			expect(refusals(outcomes).map((error) => error.code)).toEqual(Array(5).fill('RATE_LIMITED'));

			// A resend of an applied batch (as after a reconnect) is answered, not refused.
			host.send(first, { commandId: firstId, clientSeq: 10_000 });
			expect((await host.ack(firstId)).event.status).toBe('duplicate');
			// The control lane is untouched by drawing.
			await host.barrier();
		} finally {
			host.close();
		}
	});
});

describe('room handshake deadline and idle cleanup', { timeout: 30_000 }, () => {
	it('closes sockets that do not join (or whose member left) after the handshake timeout', async () => {
		const roomCode = await createRoom();
		const stub = env.GAME_ROOM.getByName(roomCode);
		const host = await joinRoom(roomCode, 'Ana');
		const leaver = await joinRoom(roomCode, 'Ben');
		const openedAtMs = Date.now();
		const lurker = await RoomSocket.open(roomCode);
		try {
			// The leaver's own socket is unbound but left for the client to close.
			await run(leaver, { type: 'room.leave' });
			const alarmAt = await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());
			expect(alarmAt).toBe(openedAtMs + HANDSHAKE_TIMEOUT_MS);

			vi.setSystemTime(openedAtMs + HANDSHAKE_TIMEOUT_MS - 1);
			expect(await runDurableObjectAlarm(stub)).toBe(true);
			expect(await openSocketCount(roomCode)).toBe(3);

			vi.setSystemTime(openedAtMs + HANDSHAKE_TIMEOUT_MS);
			expect(await runDurableObjectAlarm(stub)).toBe(true);
			expect((await lurker.closed).code).toBe(4008);
			expect((await leaver.closed).code).toBe(4008);
			// Members are unaffected.
			await host.barrier();
			expect(await openSocketCount(roomCode)).toBe(1);
		} finally {
			closeAll(host, leaver, lurker);
		}
	});

	it('deletes an idle room even while a socket waits unjoined, and tells that socket', async () => {
		const roomCode = await createRoom();
		const stub = env.GAME_ROOM.getByName(roomCode);
		vi.setSystemTime(Date.now() + IDLE_ROOM_TTL_MS + 1_000);
		const lurker = await RoomSocket.open(roomCode);
		try {
			expect(await runDurableObjectAlarm(stub)).toBe(true);
			expect(await lurker.error()).toMatchObject({ code: 'ROOM_NOT_FOUND', retryable: false });
			expect((await lurker.closed).code).toBe(4404);
			expect(await stub.info()).toEqual({ exists: false, phase: null, memberCount: 0 });
		} finally {
			lurker.close();
		}
	});

	it('keeps an idle room while a member is connected', async () => {
		const roomCode = await createRoom();
		const stub = env.GAME_ROOM.getByName(roomCode);
		const host = await joinRoom(roomCode, 'Ana');
		try {
			vi.setSystemTime(Date.now() + IDLE_ROOM_TTL_MS + 1_000);
			expect(await runDurableObjectAlarm(stub)).toBe(true);
			expect((await stub.info()).exists).toBe(true);
			await host.barrier();
		} finally {
			host.close();
		}
	});
});
