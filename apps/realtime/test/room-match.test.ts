import type { DrawingAction } from '@drawing-games/drawing-model';
import type { RoomView } from '@drawing-games/game-core';
import { env, evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { closeAll, createRoom, joinRoom, resumeRoom, run, type RoomSocket } from './room/harness';

function stroke(id: string, x = 0.2): DrawingAction[] {
	return [
		{ type: 'stroke.begin', strokeId: id, point: { x, y: 0.2 }, style: { color: '#112233', width: 0.02, opacity: 1 } },
		{ type: 'stroke.append', strokeId: id, startPointIndex: 1, points: [{ x: x + 0.3, y: 0.6 }] },
		{ type: 'stroke.end', strokeId: id, pointCount: 2 },
	];
}

async function storedMembers(roomCode: string): Promise<{ readonly connected: boolean }[]> {
	return runInDurableObject(env.GAME_ROOM.getByName(roomCode), (_instance, state) => {
		const row = state.storage.sql.exec<{ value: string }>(`SELECT value FROM kv WHERE key = 'state.members'`).one();
		return JSON.parse(row.value) as { connected: boolean }[];
	});
}

/** Polls with real timers (tests may fake Date). */
async function waitFor(check: () => Promise<boolean>, label: string, timeoutMs = 3_000): Promise<void> {
	const started = performance.now();
	while (!(await check())) {
		if (performance.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

function requireRound(view: RoomView): NonNullable<RoomView['round']> {
	if (view.round === null) throw new Error(`no round in phase ${view.phase}`);
	return view.round;
}

/** Ana + Ben on Sun (A), Cy + a bot on Moon (B); both human drawers pick their first card. */
async function startDrawingRoom(): Promise<{
	readonly roomCode: string;
	readonly ana: RoomSocket;
	readonly ben: RoomSocket;
	readonly cy: RoomSocket;
	readonly anaView: RoomView;
	readonly cyView: RoomView;
}> {
	const roomCode = await createRoom();
	const ana = await joinRoom(roomCode, 'Ana', { team: 'A' });
	const ben = await joinRoom(roomCode, 'Ben', { team: 'A' });
	const cy = await joinRoom(roomCode, 'Cy', { team: 'B' });
	await run(ana, { type: 'lobby.bot.add', team: 'B' });
	await run(ben, { type: 'lobby.ready', ready: true });
	await run(cy, { type: 'lobby.ready', ready: true });
	await run(ana, { type: 'match.start' });

	const anaDraft = requireRound(await ana.view((view) => view.phase === 'word-draft', 'draft'));
	const cyDraft = requireRound(await cy.view((view) => view.phase === 'word-draft', 'draft'));
	expect(anaDraft.mine?.amDrawer).toBe(true);
	expect(cyDraft.mine?.amDrawer).toBe(true);
	await run(ana, { type: 'draft.select', optionId: anaDraft.mine?.options?.[0]?.wordId ?? '' });
	await run(cy, { type: 'draft.select', optionId: cyDraft.mine?.options?.[0]?.wordId ?? '' });

	const anaView = await ana.view((view) => view.phase === 'drawing', 'drawing');
	const cyView = await cy.view((view) => view.phase === 'drawing', 'drawing');
	await ben.view((view) => view.phase === 'drawing', 'drawing');
	await Promise.all([ana.barrier(), ben.barrier(), cy.barrier()]);
	for (const client of [ana, ben, cy]) client.clearInbox();
	return { roomCode, ana, ben, cy, anaView, cyView };
}

describe('live drawing', () => {
	it("fans a drawer's ops out to teammates while opponents only get a preview", async () => {
		const { roomCode, ana, ben, cy, anaView } = await startDrawingRoom();
		try {
			const canvasId = requireRound(anaView).mine?.canvasId ?? '';
			const ops = stroke('s1');
			await run(ana, { type: 'drawing.batch', operations: ops });

			expect(await ben.domain('canvas.ops', (payload) => payload.canvasId === canvasId)).toEqual({ canvasId, team: 'A', ops });
			const preview = await cy.domain('canvas.preview', (payload) => payload.canvasId === canvasId);
			expect(preview.cells.some((cell) => cell === '#112233')).toBe(true);

			await Promise.all([ana.barrier(), cy.barrier()]);
			expect(cy.hasDomain('canvas.ops')).toBe(false);
			expect(cy.hasDomain('canvas.snapshot', (payload) => payload.canvasId === canvasId)).toBe(false);
			expect(ana.hasDomain('canvas.ops')).toBe(false);

			const stored = await runInDurableObject(env.GAME_ROOM.getByName(roomCode), (_instance, state) =>
				state.storage.sql.exec<{ document: string }>('SELECT document FROM canvases WHERE canvas_id = ?', canvasId).one(),
			);
			expect(JSON.parse(stored.document)).toMatchObject({ strokeOrder: ['s1'] });
		} finally {
			closeAll(ana, ben, cy);
		}
	});

	it('throttles previews to one per canvas per 800 ms with a trailing flush', async () => {
		const { ana, ben, cy, anaView } = await startDrawingRoom();
		try {
			const canvasId = requireRound(anaView).mine?.canvasId ?? '';
			for (const [index, x] of [0.1, 0.3, 0.5].entries()) {
				await run(ana, { type: 'drawing.batch', operations: stroke(`t${index}`, x) });
			}
			const first = await cy.domain('canvas.preview', (payload) => payload.canvasId === canvasId);
			await cy.barrier();
			expect(cy.hasDomain('canvas.preview', (payload) => payload.canvasId === canvasId)).toBe(false);
			// The trailing flush shows all three strokes.
			const trailing = await cy.domain('canvas.preview', (payload) => payload.canvasId === canvasId);
			const inked = (cells: readonly (string | null)[]) => cells.filter((cell) => cell !== null).length;
			expect(inked(trailing.cells)).toBeGreaterThan(inked(first.cells));
		} finally {
			closeAll(ana, ben, cy);
		}
	});

	it('resends the canvases a member may see on canvas.sync, under the same access rules', async () => {
		const { ana, ben, cy, anaView, cyView } = await startDrawingRoom();
		try {
			const sun = requireRound(anaView).mine?.canvasId ?? '';
			const moon = requireRound(cyView).mine?.canvasId ?? '';
			await run(ana, { type: 'drawing.batch', operations: stroke('s1') });
			await run(cy, { type: 'drawing.batch', operations: stroke('m1', 0.5) });
			await ben.domain('canvas.ops', (payload) => payload.canvasId === sun);
			await ben.domain('canvas.preview', (payload) => payload.canvasId === moon);
			await ana.domain('canvas.preview', (payload) => payload.canvasId === moon);
			await cy.domain('canvas.preview', (payload) => payload.canvasId === sun);
			// A half-drawn stroke is replayed as ops after the snapshot.
			const begun = stroke('s2', 0.6).slice(0, 2);
			await run(ana, { type: 'drawing.batch', operations: begun });
			await ben.domain('canvas.ops', (payload) => payload.canvasId === sun);
			await Promise.all([ana.barrier(), ben.barrier(), cy.barrier()]);
			for (const client of [ana, ben, cy]) client.clearInbox();

			// A guesser: their team's canvas in full, the opponent's as a preview only.
			const sync = { commandId: 'sync_ben_1', clientSeq: 900 };
			const syncId = ben.send({ type: 'canvas.sync' }, sync);
			expect((await ben.ack(syncId)).event.status).toBe('applied');
			const snapshot = await ben.domain('canvas.snapshot', (payload) => payload.canvasId === sun);
			expect(snapshot).toMatchObject({ team: 'A', document: { strokeOrder: ['s1'] } });
			expect(await ben.domain('canvas.ops', (payload) => payload.canvasId === sun)).toMatchObject({ ops: begun });
			const preview = await ben.domain('canvas.preview', (payload) => payload.canvasId === moon);
			expect(preview.cells.some((cell) => cell === '#112233')).toBe(true);
			expect(ben.hasDomain('canvas.snapshot', (payload) => payload.canvasId === moon)).toBe(false);
			expect(ben.hasDomain('canvas.ops', (payload) => payload.canvasId === moon)).toBe(false);

			// The drawer gets their own canvas back; nobody else is sent anything.
			await ana.ack(ana.send({ type: 'canvas.sync' }));
			expect((await ana.domain('canvas.snapshot', (payload) => payload.canvasId === sun)).document.strokeOrder).toEqual(['s1']);
			await ana.domain('canvas.preview', (payload) => payload.canvasId === moon);
			await cy.barrier();
			expect(cy.hasDomain('canvas.snapshot')).toBe(false);
			expect(cy.hasDomain('canvas.preview')).toBe(false);

			// A resend of the same command (after a reconnect, whose bind already
			// sent fresh canvases) is only acknowledged.
			await ben.barrier();
			ben.clearInbox();
			expect((await ben.ack(ben.send({ type: 'canvas.sync' }, sync))).event.status).toBe('duplicate');
			await ben.barrier();
			expect(ben.hasDomain('canvas.snapshot')).toBe(false);
			expect(ben.hasDomain('canvas.preview')).toBe(false);
		} finally {
			closeAll(ana, ben, cy);
		}
	});

	it('refuses ops from anyone but the drawer', async () => {
		const { ana, ben, cy } = await startDrawingRoom();
		try {
			const commandId = ben.send({ type: 'drawing.batch', operations: stroke('nope') });
			expect(await ben.error(commandId)).toMatchObject({ code: 'NOT_ALLOWED' });
		} finally {
			closeAll(ana, ben, cy);
		}
	});

	it("drops a batch for a canvas that is no longer the sender's, without retry", async () => {
		const { roomCode, ana, ben, cy, anaView } = await startDrawingRoom();
		try {
			const canvasId = requireRound(anaView).mine?.canvasId ?? '';
			// Ink drawn on an earlier canvas that arrives late.
			const commandId = ana.send({ type: 'drawing.batch', canvasId: 'm1-r0-A', operations: stroke('late') });
			expect(await ana.error(commandId)).toMatchObject({ code: 'STALE_CLIENT', retryable: false });
			await run(ana, { type: 'drawing.batch', canvasId, operations: stroke('now') });
			expect(await ben.domain('canvas.ops', (payload) => payload.canvasId === canvasId)).toMatchObject({ ops: stroke('now') });

			const stored = await runInDurableObject(env.GAME_ROOM.getByName(roomCode), (_instance, state) =>
				state.storage.sql.exec<{ document: string }>('SELECT document FROM canvases WHERE canvas_id = ?', canvasId).one(),
			);
			expect(JSON.parse(stored.document)).toMatchObject({ strokeOrder: ['now'] });
		} finally {
			closeAll(ana, ben, cy);
		}
	});

	it('hands the drawing to a teammate when the drawer leaves mid-round', async () => {
		const { ana, ben, cy, anaView } = await startDrawingRoom();
		try {
			const mine = requireRound(anaView).mine;
			const canvasId = mine?.canvasId ?? '';
			await run(ana, { type: 'drawing.batch', operations: stroke('a1') });
			await run(ana, { type: 'room.leave' });

			const benView = await ben.view((view) => view.round?.mine?.amDrawer === true, 'ben draws');
			expect(benView.round?.mine).toMatchObject({ canvasId, canDraw: true, word: { term: mine?.word?.term } });
			await run(ben, { type: 'drawing.batch', operations: stroke('b1', 0.6) });
			const preview = await cy.domain('canvas.preview', (payload) => payload.canvasId === canvasId);
			expect(preview.cells.some((cell) => cell !== null)).toBe(true);
		} finally {
			closeAll(ana, ben, cy);
		}
	});

	it('replays a reconnecting teammate the canvas, including after eviction', async () => {
		const { roomCode, ana, ben, cy, anaView } = await startDrawingRoom();
		const canvasId = requireRound(anaView).mine?.canvasId ?? '';
		await run(ana, { type: 'drawing.batch', operations: stroke('kept') });
		await evictDurableObject(env.GAME_ROOM.getByName(roomCode), { webSockets: 'close' });
		await Promise.all([ana.closed, ben.closed, cy.closed]);

		const benAgain = await resumeRoom(roomCode, ben.resumeToken ?? '');
		try {
			const snapshot = await benAgain.domain('canvas.snapshot', (payload) => payload.canvasId === canvasId);
			expect(snapshot.document.strokeOrder).toEqual(['kept']);
			expect((await benAgain.view()).phase).toBe('drawing');
		} finally {
			benAgain.close();
		}
	});

	it('sends private guess feedback and reveals the opponent canvas once solved', async () => {
		const { ana, ben, cy, anaView } = await startDrawingRoom();
		try {
			const round = requireRound(anaView);
			const term = round.mine?.word?.term ?? '';
			const opponentCanvas = round.opponent?.canvasId ?? '';
			expect(term).not.toBe('');

			const wrong = ben.send({ type: 'guess.submit', text: 'zzqxv' });
			await ben.ack(wrong);
			expect(await ben.domain('guess.feedback')).toEqual({ text: 'zzqxv', verdict: 'wrong' });
			await new Promise((resolve) => setTimeout(resolve, 450));

			await run(ben, { type: 'guess.submit', text: term.toUpperCase() });
			expect(await ben.domain('guess.feedback')).toEqual({ text: term.toUpperCase(), verdict: 'correct' });
			const benView = await ben.view((view) => view.round?.mine?.solved === true, 'solved');
			expect(benView.round?.mine?.solution?.guesserId).toBe(ben.memberId);
			await ana.view((view) => view.round?.mine?.solved === true, 'drawer sees solve');
			const cyView = await cy.view((view) => view.round?.opponent?.solved === true, 'opponent sees solve');
			expect(cyView.round?.mine?.solved).toBe(false);

			// Solving widens Sun's access to Moon's canvas.
			await ben.domain('canvas.snapshot', (payload) => payload.canvasId === opponentCanvas);
			await cy.barrier();
			expect(cy.hasDomain('guess.feedback')).toBe(false);
		} finally {
			closeAll(ana, ben, cy);
		}
	});
});

describe('practice match on alarms', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('progresses through draft, drawing, and results with bots', async () => {
		vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
		const roomCode = await createRoom();
		const stub = env.GAME_ROOM.getByName(roomCode);
		const host = await joinRoom(roomCode, 'Ana');
		try {
			await run(host, { type: 'lobby.bot.add', team: 'A' });
			await run(host, { type: 'lobby.bot.add', team: 'B' });
			await run(host, { type: 'lobby.bot.add', team: 'B' });
			await run(host, { type: 'match.start' });

			const draft = await host.view((view) => view.phase === 'word-draft', 'draft');
			const draftRound = requireRound(draft);
			expect(draftRound.mine?.amDrawer).toBe(true);
			expect(draftRound.mine?.options).toHaveLength(3);
			const ownCanvas = draftRound.mine?.canvasId ?? '';
			const botCanvas = draftRound.opponent?.canvasId ?? '';
			await host.domain('canvas.snapshot', (payload) => payload.canvasId === ownCanvas);
			await host.domain('canvas.preview', (payload) => payload.canvasId === botCanvas);

			// The draft deadline passes: the host's card is auto-picked.
			vi.setSystemTime((draft.phaseDeadlineAtMs ?? 0) + 1);
			expect(await runDurableObjectAlarm(stub)).toBe(true);
			const drawing = await host.view((view) => view.phase === 'drawing', 'drawing');
			expect(requireRound(drawing).mine?.word).not.toBeNull();

			// The bot drawer draws and its teammate solves before the deadline.
			vi.setSystemTime((drawing.phaseDeadlineAtMs ?? 0) + 1);
			expect(await runDurableObjectAlarm(stub)).toBe(true);
			const results = await host.view((view) => view.phase === 'round-results', 'results');
			expect(results.results?.teams.B.solved).toBe(true);
			expect(results.results?.teams.A.solved).toBe(false);
			const revealed = await host.domain('canvas.snapshot', (payload) => payload.canvasId === botCanvas);
			expect(revealed.document.strokeOrder.length).toBeGreaterThan(0);

			vi.setSystemTime((results.phaseDeadlineAtMs ?? 0) + 1);
			expect(await runDurableObjectAlarm(stub)).toBe(true);
			const next = await host.view((view) => view.phase === 'word-draft', 'round 2 draft');
			expect(next.match?.roundNumber).toBe(2);
			expect(requireRound(next).mine?.amDrawer).toBe(false);

			// The alarm stays armed for the next deadline.
			const alarmAt = await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());
			expect(alarmAt).not.toBeNull();
			expect(alarmAt ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(next.phaseDeadlineAtMs ?? 0);
		} finally {
			host.close();
		}
	});

	it('deletes an idle room with no sockets after six hours', async () => {
		vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
		const roomCode = await createRoom();
		const stub = env.GAME_ROOM.getByName(roomCode);
		const host = await joinRoom(roomCode, 'Ana');
		host.close();
		await waitFor(async () => (await storedMembers(roomCode)).every((member) => !member.connected), 'Ana offline');

		vi.setSystemTime(Date.now() + 6 * 60 * 60 * 1000 - 1_000);
		expect(await runDurableObjectAlarm(stub)).toBe(true);
		expect((await stub.info()).exists).toBe(true);

		vi.setSystemTime(Date.now() + 2_000);
		expect(await runDurableObjectAlarm(stub)).toBe(true);
		expect(await stub.info()).toEqual({ exists: false, phase: null, memberCount: 0 });
	});
});
