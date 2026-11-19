import {
	EMPTY_MEMBER_MATCH_STATS,
	type AccountProfileView,
	type MatchSummaryRecord,
	type MemberMatchStats,
	type WordHistoryEvent,
} from '@drawing-games/game-core';
import type { AccountErrorBody } from '@drawing-games/protocol';
import { env } from 'cloudflare:test';
import { exports as workerExports } from 'cloudflare:workers';
import { expect } from 'vitest';

export const PASSWORD = 'correct horse battery';

/** Storage is shared across tests, so every test needs fresh usernames. */
export function uniqueUsername(prefix: string): string {
	return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

interface CallOptions {
	readonly body?: unknown;
	readonly rawBody?: string;
	readonly token?: string;
}

export function call(method: string, path: string, options: CallOptions = {}): Promise<Response> {
	const headers = new Headers();
	if (options.token !== undefined) headers.set('Authorization', `Bearer ${options.token}`);
	const body = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
	if (body !== undefined) headers.set('Content-Type', 'application/json');
	return workerExports.default.fetch(new Request(`https://example.com${path}`, { method, headers, body }));
}

export interface SessionBody {
	readonly token: string;
	readonly profile: AccountProfileView;
}

export async function readJson<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

export async function expectError(response: Response, status: number, code: AccountErrorBody['code']): Promise<AccountErrorBody> {
	expect(response.status).toBe(status);
	const body = await readJson<AccountErrorBody>(response);
	expect(body.code).toBe(code);
	expect(typeof body.error).toBe('string');
	return body;
}

export async function signup(username: string, password = PASSWORD, displayName?: string): Promise<SessionBody> {
	const response = await call('POST', '/accounts', {
		body: displayName === undefined ? { username, password } : { username, password, displayName },
	});
	expect(response.status).toBe(201);
	return readJson<SessionBody>(response);
}

export function login(username: string, password = PASSWORD): Promise<Response> {
	return call('POST', '/accounts/session', { body: { username, password } });
}

export async function getMe(token: string): Promise<AccountProfileView> {
	const response = await call('GET', '/accounts/me', { token });
	expect(response.status).toBe(200);
	return readJson<AccountProfileView>(response);
}

export function actorStub(username: string) {
	return env.ACCOUNTS.getByName(`user:${username}`);
}

export function wordEvent(overrides: Partial<WordHistoryEvent> & Pick<WordHistoryEvent, 'wordId' | 'role' | 'atMs'>): WordHistoryEvent {
	return {
		term: overrides.wordId.replace(/^w-/, ''),
		packId: 'everyday',
		difficulty: 'medium',
		solved: null,
		solveMs: null,
		points: null,
		roomCode: 'ROOM1',
		...overrides,
	};
}

export function matchSummary(
	overrides: Partial<Omit<MatchSummaryRecord, 'stats'>> & Pick<MatchSummaryRecord, 'matchNumber'>,
	stats: Partial<MemberMatchStats> = {},
): MatchSummaryRecord {
	return {
		roomCode: 'MATCH',
		endedAtMs: 1_700_000_000_000 + overrides.matchNumber * 60_000,
		team: 'A',
		result: 'win',
		teamScore: 300,
		opponentScore: 200,
		endedReason: 'completed',
		withBots: false,
		roundsPlayed: 4,
		...overrides,
		stats: { ...EMPTY_MEMBER_MATCH_STATS, ...stats },
	};
}
