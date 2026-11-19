import { ROOM_STATE_VERSION, type MatchState, type RoomState } from '@drawing-games/game-core';

/**
 * Persists `RoomState` as JSON in the `kv` table, split into parts so a hot
 * command (a drawing batch) rewrites only what changed. The reducer never
 * mutates and shares untouched sub-objects, so a reference comparison is an
 * exact and cheap change test.
 */
type CoreState = Omit<RoomState, 'members' | 'match' | 'wordMemory' | 'bots'>;
type MatchWithoutHistory = Omit<MatchState, 'history'>;

interface StatePart {
	readonly key: string;
	/** Identity that changes whenever the stored value would change. */
	readonly select: (state: RoomState) => unknown;
	readonly encode: (state: RoomState) => unknown;
}

const KEY_PREFIX = 'state.';

const PARTS: readonly StatePart[] = [
	{
		key: 'core',
		select: (state) => state,
		encode: ({ members: _members, match: _match, wordMemory: _wordMemory, bots: _bots, ...core }): CoreState => core,
	},
	{ key: 'members', select: (state) => state.members, encode: (state) => state.members },
	{
		key: 'match',
		select: (state) => state.match,
		encode: (state): MatchWithoutHistory | null => {
			if (state.match === null) return null;
			const { history: _history, ...rest } = state.match;
			return rest;
		},
	},
	{ key: 'history', select: (state) => state.match?.history ?? null, encode: (state) => state.match?.history ?? null },
	{ key: 'wordMemory', select: (state) => state.wordMemory, encode: (state) => state.wordMemory },
	{ key: 'bots', select: (state) => state.bots, encode: (state) => state.bots },
];

/** Writes every part of `next` that differs from `prev` (all parts when prev is null). */
export function saveRoomState(sql: SqlStorage, prev: RoomState | null, next: RoomState): void {
	for (const part of PARTS) {
		if (prev !== null && part.select(prev) === part.select(next)) continue;
		sql.exec(
			`INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
			KEY_PREFIX + part.key,
			JSON.stringify(part.encode(next)),
		);
	}
}

export function loadRoomState(sql: SqlStorage): RoomState | null {
	const values = new Map<string, unknown>();
	for (const row of sql.exec<{ key: string; value: string }>(`SELECT key, value FROM kv WHERE key LIKE 'state.%'`)) {
		values.set(row.key.slice(KEY_PREFIX.length), JSON.parse(row.value) as unknown);
	}
	if (!values.has('core')) return null;

	// The parts were written by saveRoomState from a valid RoomState.
	const core = values.get('core') as CoreState;
	if (core.version !== ROOM_STATE_VERSION) throw new Error(`Unsupported stored room state version ${String(core.version)}`);
	const match = (values.get('match') ?? null) as MatchWithoutHistory | null;
	const history = (values.get('history') ?? []) as MatchState['history'];
	return {
		...core,
		members: values.get('members') as RoomState['members'],
		wordMemory: values.get('wordMemory') as RoomState['wordMemory'],
		bots: values.get('bots') as RoomState['bots'],
		match: match === null ? null : { ...match, history },
	};
}
