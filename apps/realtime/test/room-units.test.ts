import { createDrawingState, drawingReducer, type DrawingAction } from '@drawing-games/drawing-model';
import { applyRoomCommand, createRoomState, EMPTY_WORD_MEMORY, WORD_MEMORY_LIMITS, type RoomState } from '@drawing-games/game-core';
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { CanvasStore, pointCount } from '../src/room/canvas-store';
import { CommandLog } from '../src/room/command-log';
import { mapMemberCommand } from '../src/room/command-map';
import { MAX_MESSAGE_BYTES } from '../src/room/constants';
import { decodeClientMessage, MessageTooLargeError, readCommandId } from '../src/room/envelopes';
import { inProgressOps } from '../src/room/outbox';
import { PreviewThrottle, type TimerApi } from '../src/room/preview-throttle';
import { createRoomSchema } from '../src/room/schema';
import { generateRoomCode } from '../src/room/secrets';
import { loadRoomState, saveRoomState } from '../src/room/state-store';
import { startingWordMemory } from '../src/room/word-memory';

const STYLE = { color: '#112233', width: 0.01, opacity: 1 } as const;

function begin(strokeId: string): DrawingAction {
	return { type: 'stroke.begin', strokeId, point: { x: 0.1, y: 0.1 }, style: STYLE };
}

function append(strokeId: string, startPointIndex: number, count: number): DrawingAction {
	return {
		type: 'stroke.append',
		strokeId,
		startPointIndex,
		points: Array.from({ length: count }, (_, index) => ({ x: 0.2, y: (index + 1) / (count + 1) })),
	};
}

/** Runs `work` against a fresh, schema-initialized SQLite database. */
function withSql<T>(work: (sql: SqlStorage) => T): Promise<T> {
	const scratch = env.GAME_ROOM.getByName(`unit-${crypto.randomUUID()}`);
	return runInDurableObject(scratch, (_instance, state) => {
		createRoomSchema(state.storage.sql);
		return work(state.storage.sql);
	});
}

describe('CanvasStore limits', () => {
	it('refuses strokes past the stroke cap', async () => {
		await withSql((sql) => {
			const store = new CanvasStore(sql, { maxStrokes: 2, maxPoints: 1_000 });
			const ops = ['a', 'b', 'c'].flatMap((id) => [begin(id), { type: 'stroke.end', strokeId: id, pointCount: 1 } as DrawingAction]);
			const result = store.applyOps('m1-r1-A', 'A', ops);
			expect(result.overLimit).toBe(true);
			expect(result.applied.map((op) => op.type)).toEqual(['stroke.begin', 'stroke.end', 'stroke.begin', 'stroke.end']);
			expect(store.get('m1-r1-A')?.drawing.document.strokeOrder).toEqual(['a', 'b']);
		});
	});

	it('abandons a stroke whose append would pass the point cap', async () => {
		await withSql((sql) => {
			const store = new CanvasStore(sql, { maxStrokes: 10, maxPoints: 10 });
			const result = store.applyOps('m1-r1-A', 'A', [begin('a'), append('a', 1, 5), append('a', 6, 5), append('a', 11, 1)]);
			expect(result.overLimit).toBe(true);
			expect(result.applied).toEqual([begin('a'), append('a', 1, 5), { type: 'stroke.delete', strokeId: 'a' }]);
			const drawing = store.get('m1-r1-A')?.drawing;
			expect(drawing?.inProgressOrder).toEqual([]);
			expect(pointCount(drawing ?? createDrawingState())).toBe(0);
		});
	});

	it('skips ops the reducer ignores and persists documents on flush', async () => {
		await withSql((sql) => {
			const store = new CanvasStore(sql);
			const first = store.applyOps('m1-r1-B', 'B', [begin('a'), begin('a'), { type: 'drawing.undo' }]);
			expect(first.applied).toEqual([begin('a')]);
			expect(first.documentChanged).toBe(false);
			const ended = store.applyOps('m1-r1-B', 'B', [{ type: 'stroke.end', strokeId: 'a', pointCount: 1 }]);
			expect(ended.documentChanged).toBe(true);
			store.flush(1);
			store.dropCache();
			expect(store.get('m1-r1-B')).toMatchObject({ team: 'B', drawing: { document: { strokeOrder: ['a'] } } });

			store.deleteAll();
			expect(store.get('m1-r1-B')).toBeNull();
			store.flush(2);
			expect(sql.exec('SELECT * FROM canvases').toArray()).toEqual([]);
		});
	});
});

describe('inProgressOps', () => {
	it('replays half-drawn strokes in protocol-sized appends', () => {
		let drawing = createDrawingState();
		for (const op of [begin('a'), append('a', 1, 200)]) drawing = drawingReducer(drawing, op);
		const replay = inProgressOps(drawing);
		expect(replay.map((op) => op.type)).toEqual(['stroke.begin', 'stroke.append', 'stroke.append']);
		let copy = createDrawingState();
		for (const op of replay) copy = drawingReducer(copy, op);
		expect(copy.inProgressById.a?.points).toEqual(drawing.inProgressById.a?.points);
	});
});

describe('PreviewThrottle', () => {
	it('sends at most once per interval with one trailing flush', () => {
		let now = 0;
		const scheduled: { at: number; run: () => void }[] = [];
		const timers: TimerApi = {
			setTimeout: (run, ms) => scheduled.push({ at: now + ms, run }),
			clearTimeout: () => undefined,
		};
		const sent: number[] = [];
		const throttle = new PreviewThrottle(
			() => sent.push(now),
			() => now,
			800,
			timers,
		);

		throttle.request('c');
		now = 100;
		throttle.request('c');
		now = 200;
		throttle.request('c');
		expect(sent).toEqual([0]);
		expect(scheduled.map((entry) => entry.at)).toEqual([800]);

		now = 800;
		scheduled.shift()?.run();
		expect(sent).toEqual([0, 800]);
		now = 900;
		throttle.request('c');
		expect(scheduled.map((entry) => entry.at)).toEqual([1600]);
		throttle.request('other');
		expect(sent).toEqual([0, 800, 900]);
	});
});

describe('mapMemberCommand', () => {
	it('maps wire commands onto reducer commands for the sender', () => {
		expect(mapMemberCommand({ type: 'draft.select', optionId: 'animals/cat' }, 'm_1')).toEqual({
			kind: 'room',
			command: { type: 'draft.select', actorId: 'm_1', wordId: 'animals/cat' },
		});
		expect(mapMemberCommand({ type: 'draft.seen', optionId: 'animals/cat' }, 'm_1')).toEqual({
			kind: 'room',
			command: { type: 'draft.replace', actorId: 'm_1', wordId: 'animals/cat', reason: 'seen-before' },
		});
		expect(mapMemberCommand({ type: 'lobby.team', team: 'B' }, 'm_1')).toMatchObject({ command: { memberId: 'm_1', actorId: 'm_1' } });
		expect(mapMemberCommand({ type: 'lobby.team', team: 'B', memberId: 'bot_1' }, 'm_1')).toMatchObject({ command: { memberId: 'bot_1' } });
		expect(mapMemberCommand({ type: 'room.leave' }, 'm_1')).toEqual({ kind: 'room', command: { type: 'member.leave', memberId: 'm_1' } });
		expect(mapMemberCommand({ type: 'rematch.vote', mode: 'decline' }, 'm_1')).toEqual({ kind: 'ack-only' });
		expect(mapMemberCommand({ type: 'rematch.vote', mode: 'change-settings' }, 'm_1')).toMatchObject({
			command: { type: 'match.rematch', mode: 'change-settings' },
		});
		expect(mapMemberCommand({ type: 'account.link', accountToken: null }, 'm_1')).toEqual({ kind: 'link-account', accountToken: null });
		expect(mapMemberCommand({ type: 'drawing.batch', operations: [begin('a')] }, 'm_1')).toEqual({
			kind: 'room',
			command: { type: 'drawing.ops', actorId: 'm_1', ops: [begin('a')] },
		});
		expect(mapMemberCommand({ type: 'drawing.batch', canvasId: 'm1-r2-A', operations: [begin('a')] }, 'm_1')).toEqual({
			kind: 'room',
			command: { type: 'drawing.ops', actorId: 'm_1', canvasId: 'm1-r2-A', ops: [begin('a')] },
		});
	});
});

describe('startingWordMemory', () => {
	it('merges guest and account memory, newest kept, stored oldest first', () => {
		const memory = startingWordMemory({ avoid: ['a/1', 'a/2'], soft: ['s/1', 'g/1'] }, ['g/1', 'g/2']);
		expect(memory).toEqual({ avoid: ['a/2', 'a/1'], soft: ['s/1', 'g/2', 'g/1'] });
	});

	it('caps each list to the shared limits', () => {
		const ids = Array.from({ length: WORD_MEMORY_LIMITS.soft + 50 }, (_, index) => `p/w${index}`);
		const memory = startingWordMemory(null, ids);
		expect(memory.soft).toHaveLength(WORD_MEMORY_LIMITS.soft);
		expect(memory.soft.at(-1)).toBe('p/w0');
		expect(memory.avoid).toEqual([]);
	});
});

describe('envelope decoding', () => {
	it('enforces the byte cap and UTF-8', () => {
		expect(() => decodeClientMessage('x'.repeat(MAX_MESSAGE_BYTES + 1))).toThrow(MessageTooLargeError);
		expect(() => decodeClientMessage(new Uint8Array(MAX_MESSAGE_BYTES + 1).buffer)).toThrow(MessageTooLargeError);
		expect(() => decodeClientMessage(new Uint8Array([0xff, 0xfe]).buffer)).toThrow(SyntaxError);
		expect(() => decodeClientMessage('{nope')).toThrow(SyntaxError);
		expect(decodeClientMessage(new TextEncoder().encode('{"a":1}').buffer)).toEqual({ a: 1 });
	});

	it('recovers a usable commandId from a malformed envelope', () => {
		expect(readCommandId({ commandId: 'c_1', junk: true })).toBe('c_1');
		expect(readCommandId({ commandId: 'has spaces' })).toBeUndefined();
		expect(readCommandId('nope')).toBeUndefined();
	});
});

describe('room codes', () => {
	it('uses the unambiguous alphabet', () => {
		for (let index = 0; index < 200; index += 1) expect(generateRoomCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
	});
});

describe('state store', () => {
	function startedRoom(): RoomState {
		let state = createRoomState({ roomCode: 'UNIT1', nowMs: 1_000, seed: 7 });
		const apply = (command: Parameters<typeof applyRoomCommand>[1]) => {
			const result = applyRoomCommand(state, command, 2_000);
			if (!result.ok) throw new Error(result.error.message);
			state = result.state;
		};
		apply({ type: 'member.join', memberId: 'm_a', displayName: 'Ana', accountId: null, memory: EMPTY_WORD_MEMORY });
		for (const team of ['A', 'B', 'B'] as const) apply({ type: 'lobby.add-bot', actorId: 'm_a', team });
		apply({ type: 'match.start', actorId: 'm_a' });
		return state;
	}

	it('round-trips the state through its parts', async () => {
		await withSql((sql) => {
			const state = startedRoom();
			saveRoomState(sql, null, state);
			expect(loadRoomState(sql)).toEqual(JSON.parse(JSON.stringify(state)));
		});
	});

	it('rewrites only the parts whose references changed', async () => {
		await withSql((sql) => {
			const before = startedRoom();
			saveRoomState(sql, null, before);
			const after: RoomState = { ...before, seq: before.seq + 1, lastActivityAtMs: 9_999 };
			sql.exec(`UPDATE kv SET value = 'untouched' WHERE key <> 'state.core'`);
			saveRoomState(sql, before, after);
			const rows = sql.exec<{ key: string; value: string }>('SELECT key, value FROM kv ORDER BY key').toArray();
			expect(rows.filter((row) => row.value !== 'untouched').map((row) => row.key)).toEqual(['state.core']);
			expect(JSON.parse(rows.find((row) => row.key === 'state.core')?.value ?? '{}')).toMatchObject({ seq: after.seq });
		});
	});
});

describe('CommandLog', () => {
	it('keeps only the newest commands', async () => {
		await withSql((sql) => {
			const log = new CommandLog(sql, 3);
			for (let index = 1; index <= 5; index += 1) {
				log.insert({ commandId: `c${index}`, memberId: 'm_a', signature: 'sig', clientSeq: index, roomSeq: index }, index);
			}
			expect(log.find('c1')).toBeNull();
			expect(log.find('c2')).toBeNull();
			expect(log.find('c5')).toEqual({ commandId: 'c5', memberId: 'm_a', signature: 'sig', clientSeq: 5, roomSeq: 5 });
			expect(sql.exec<{ total: number }>('SELECT COUNT(*) AS total FROM commands').one().total).toBe(3);
		});
	});
});
