import {
	EMPTY_ACCOUNT_STATS,
	EMPTY_MEMBER_MATCH_STATS,
	WORD_MEMORY_LIMITS,
	type AccountProfileView,
	type WordHistoryEvent,
} from '@drawing-games/game-core';
import { ACCOUNT_TOKEN_PATTERN } from '@drawing-games/protocol';
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { recordAccountMatch, recordAccountWords, verifyAccountToken } from '../src/accounts/client';
import { MAX_JSON_BODY_BYTES, readJsonBody } from '../src/http';
import { ACCOUNT_LIMITS } from '../src/accounts/limits';
import { deriveWordMemory, foldMatchIntoStats, parseStoredStats } from '../src/accounts/stats';
import { sanitizeDisplayName, sanitizeMatchSummary, sanitizeWordEvent } from '../src/accounts/validate';
import {
	actorStub,
	call,
	expectError,
	getMe,
	login,
	matchSummary,
	PASSWORD,
	readJson,
	signup,
	uniqueUsername,
	wordEvent,
	type SessionBody,
} from './accounts/helpers';

function tableNames(username: string): Promise<string[]> {
	return runInDurableObject(actorStub(username), (_instance, state) =>
		state.storage.sql
			.exec<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'`)
			.toArray()
			.map((row) => row.name),
	);
}

function countRows(username: string, table: 'sessions' | 'word_events' | 'matches' | 'failed_logins'): Promise<number> {
	return runInDurableObject(
		actorStub(username),
		(_instance, state) => state.storage.sql.exec<{ count: number }>(`SELECT count(*) AS count FROM ${table}`).one().count,
	);
}

describe('quick account HTTP lifecycle', () => {
	it('signs up, reads the profile, logs out, and then rejects the token', async () => {
		const username = uniqueUsername('life');
		const response = await call('POST', '/accounts', { body: { username: username.toUpperCase(), password: PASSWORD } });

		expect(response.status).toBe(201);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		const { token, profile } = await readJson<SessionBody>(response);
		expect(token).toMatch(ACCOUNT_TOKEN_PATTERN);
		expect(token.startsWith(`${username}.`)).toBe(true);
		expect(profile).toMatchObject({
			accountId: username,
			username,
			displayName: username,
			stats: EMPTY_ACCOUNT_STATS,
			recentWords: [],
			recentMatches: [],
			avoidedWordCount: 0,
		});
		expect(profile.createdAtMs).toBeGreaterThan(0);
		expect(JSON.stringify(profile)).not.toContain(PASSWORD);

		expect(await getMe(token)).toEqual(profile);

		const logout = await call('DELETE', '/accounts/session', { token });
		expect(logout.status).toBe(204);
		expect(logout.headers.get('Access-Control-Allow-Origin')).toBe('*');
		await expectError(await call('GET', '/accounts/me', { token }), 401, 'UNAUTHORIZED');

		const again = await login(username);
		expect(again.status).toBe(200);
		const relogged = await readJson<SessionBody>(again);
		expect(relogged.token).not.toBe(token);
		expect((await getMe(relogged.token)).username).toBe(username);
	});

	it('stores only hashes of the password and tokens', async () => {
		const username = uniqueUsername('hash');
		const { token } = await signup(username);

		const stored = await runInDurableObject(actorStub(username), (_instance, state) => ({
			account: state.storage.sql.exec(`SELECT * FROM account`).toArray(),
			sessions: state.storage.sql.exec(`SELECT * FROM sessions`).toArray(),
		}));
		const dump = JSON.stringify(stored);
		expect(dump).not.toContain(PASSWORD);
		expect(dump).not.toContain(token.split('.')[1]);
		expect(stored.account[0]).toMatchObject({ password_iterations: ACCOUNT_LIMITS.pbkdf2Iterations });
		expect(await tableNames(username)).toContain('account');
	});

	it('refuses a signup routed to an actor named for a different username', async () => {
		const actorName = uniqueUsername('owner');
		const other = uniqueUsername('intruder');

		const result = await actorStub(actorName).signup({ username: other, password: PASSWORD });

		expect(result).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
		expect(await tableNames(actorName)).toEqual([]);
	});

	it('rejects a duplicate username case-insensitively and keeps the original password', async () => {
		const username = uniqueUsername('dup');
		await signup(username);

		await expectError(
			await call('POST', '/accounts', { body: { username: username.toUpperCase(), password: 'another-pass' } }),
			409,
			'USERNAME_TAKEN',
		);
		expect((await login(username)).status).toBe(200);
		await expectError(await login(username, 'another-pass'), 401, 'INVALID_CREDENTIALS');
	});

	it('rejects invalid signup, login, and profile input with 400', async () => {
		const username = uniqueUsername('bad');
		const invalidSignups: readonly unknown[] = [
			{ username: 'ab', password: PASSWORD },
			{ username: 'has space', password: PASSWORD },
			{ username: 'emoji😀', password: PASSWORD },
			{ username, password: 'short' },
			{ username, password: 'x'.repeat(129) },
			{ username, password: PASSWORD, displayName: 'x'.repeat(25) },
			{ username, password: PASSWORD, displayName: '   ' },
			{ username, password: PASSWORD, email: 'me@example.com' },
			{ username },
			[],
		];
		for (const body of invalidSignups) {
			const error = await expectError(await call('POST', '/accounts', { body }), 400, 'INVALID_INPUT');
			expect(error.error).not.toContain(PASSWORD);
		}
		await expectError(await call('POST', '/accounts', { rawBody: '{not json' }), 400, 'INVALID_INPUT');
		await expectError(await call('POST', '/accounts'), 400, 'INVALID_INPUT');
		await expectError(await call('POST', '/accounts/session', { body: { username } }), 400, 'INVALID_INPUT');
		await expectError(await call('POST', '/accounts/session', { body: { username, password: '' } }), 400, 'INVALID_INPUT');

		// None of the rejected signups created the account.
		expect(await tableNames(username)).toEqual([]);

		const { token } = await signup(username);
		await expectError(await call('PATCH', '/accounts/me', { token, body: { displayName: '' } }), 400, 'INVALID_INPUT');
		await expectError(await call('PATCH', '/accounts/me', { token, body: { displayName: 'ok', extra: true } }), 400, 'INVALID_INPUT');
		await expectError(await call('PATCH', '/accounts/me', { token, body: { displayName: '\u0007\u0008' } }), 400, 'INVALID_INPUT');
	});

	it('refuses oversized bodies with 413 before reading them, and non-object bodies with 400', async () => {
		const username = uniqueUsername('big');
		const oversized = JSON.stringify({ username, password: PASSWORD, displayName: 'x'.repeat(20_000) });
		const declared = await expectError(await call('POST', '/accounts', { rawBody: oversized }), 413, 'INVALID_INPUT');
		expect(declared.error).toBe('Payload too large.');

		for (const rawBody of ['', '{not json', '[]', '"text"', 'null', '\uFFFD{}']) {
			const error = await expectError(await call('POST', '/accounts', { rawBody }), 400, 'INVALID_INPUT');
			expect(error.error).toBe('Body must be a JSON object.');
		}
		const { token } = await signup(username);
		await expectError(await call('PATCH', '/accounts/me', { token, rawBody: oversized }), 413, 'INVALID_INPUT');
		await expectError(await call('POST', '/accounts/session', { rawBody: oversized }), 413, 'INVALID_INPUT');
		expect((await getMe(token)).displayName).toBe(username);
	});

	it('rejects display names with no visible character', async () => {
		const invisible = ['\u200b\u200b', '\u202e', ' \u2066\u200d\u2069 ', '\u00ad', '\u3164'];
		for (const displayName of invisible) {
			const username = uniqueUsername('zw');
			const error = await expectError(
				await call('POST', '/accounts', { body: { username, password: PASSWORD, displayName } }),
				400,
				'INVALID_INPUT',
			);
			expect(error.error).toBe('Display names need at least one visible character.');
			expect(await tableNames(username)).toEqual([]);
		}

		const username = uniqueUsername('zw');
		const { token } = await signup(username, PASSWORD, 'Visible');
		for (const displayName of invisible) {
			const error = await expectError(await call('PATCH', '/accounts/me', { token, body: { displayName } }), 400, 'INVALID_INPUT');
			expect(error.error).toBe('Display names need at least one visible character.');
		}
		expect((await getMe(token)).displayName).toBe('Visible');

		const response = await call('PATCH', '/accounts/me', { token, body: { displayName: '\u202eInk\u200b Master' } });
		expect(response.status).toBe(200);
		expect((await readJson<AccountProfileView>(response)).displayName).toBe('Ink Master');
	});

	it('answers 401 for wrong passwords, then 429 for the rest of the lockout window', async () => {
		const username = uniqueUsername('lock');
		await signup(username);

		for (let attempt = 0; attempt < ACCOUNT_LIMITS.maxFailedLogins; attempt += 1) {
			await expectError(await login(username, `wrong-password-${attempt}`), 401, 'INVALID_CREDENTIALS');
		}
		const locked = await login(username);
		await expectError(locked, 429, 'RATE_LIMITED');
		const retryAfter = Number(locked.headers.get('Retry-After'));
		expect(retryAfter).toBeGreaterThan(0);
		expect(retryAfter).toBeLessThanOrEqual(ACCOUNT_LIMITS.failedLoginWindowMs / 1000);
		// Locked attempts are not verified or counted, so the window cannot be extended.
		await expectError(await login(username, 'still-wrong'), 429, 'RATE_LIMITED');
		expect(await countRows(username, 'failed_logins')).toBe(ACCOUNT_LIMITS.maxFailedLogins);

		await runInDurableObject(actorStub(username), (_instance, state) => {
			state.storage.sql.exec(`UPDATE failed_logins SET at_ms = at_ms - ?`, ACCOUNT_LIMITS.failedLoginWindowMs);
		});
		expect((await login(username)).status).toBe(200);
		expect(await countRows(username, 'failed_logins')).toBe(0);
	});

	it('treats an unknown username as bad credentials without creating storage', async () => {
		const username = uniqueUsername('ghost');

		await expectError(await login(username), 401, 'INVALID_CREDENTIALS');
		await expectError(await call('GET', '/accounts/me', { token: `${username}.${'a'.repeat(43)}` }), 401, 'UNAUTHORIZED');
		expect((await call('DELETE', '/accounts/session', { token: `${username}.${'a'.repeat(43)}` })).status).toBe(204);
		expect(await verifyAccountToken(env, `${username}.${'a'.repeat(43)}`)).toBeNull();
		await recordAccountWords(env, username, [wordEvent({ wordId: 'w-ghost', role: 'drew', atMs: 1 })]);
		await recordAccountMatch(env, username, matchSummary({ matchNumber: 1 }));

		expect(await tableNames(username)).toEqual([]);
	});

	it('requires a well-formed bearer token', async () => {
		await expectError(await call('GET', '/accounts/me'), 401, 'UNAUTHORIZED');
		await expectError(await call('GET', '/accounts/me', { token: 'not-a-token' }), 401, 'UNAUTHORIZED');
		await expectError(await call('PATCH', '/accounts/me', { body: { displayName: 'Nope' } }), 401, 'UNAUTHORIZED');
		await expectError(await call('DELETE', '/accounts/session'), 401, 'UNAUTHORIZED');
	});

	it("never lets one account's token read or change another account", async () => {
		const alice = uniqueUsername('alice');
		const bob = uniqueUsername('bob');
		const aliceSession = await signup(alice, PASSWORD, 'Alice');
		await signup(bob, PASSWORD, 'Bob');
		const secret = aliceSession.token.slice(alice.length + 1);
		const forged = `${bob}.${secret}`;

		expect((await getMe(aliceSession.token)).username).toBe(alice);
		await expectError(await call('GET', '/accounts/me', { token: forged }), 401, 'UNAUTHORIZED');
		await expectError(await call('PATCH', '/accounts/me', { token: forged, body: { displayName: 'Hacked' } }), 401, 'UNAUTHORIZED');
		expect(await verifyAccountToken(env, forged)).toBeNull();

		const bobSession = await readJson<SessionBody>(await login(bob));
		expect(bobSession.profile.displayName).toBe('Bob');
	});

	it('updates the display name after cleaning whitespace', async () => {
		const username = uniqueUsername('name');
		const { token, profile } = await signup(username, PASSWORD, '  Sketch   Queen ');
		expect(profile.displayName).toBe('Sketch Queen');

		const response = await call('PATCH', '/accounts/me', { token, body: { displayName: '\tInk  \n Master ' } });
		expect(response.status).toBe(200);
		expect((await readJson<AccountProfileView>(response)).displayName).toBe('Ink Master');
		expect((await getMe(token)).displayName).toBe('Ink Master');
		expect((await verifyAccountToken(env, token))?.displayName).toBe('Ink Master');
	});

	it('routes unknown paths to 404 and wrong methods to 405', async () => {
		await expectError(await call('GET', '/accounts/nope'), 404, 'NOT_FOUND');
		const wrong = await call('GET', '/accounts');
		expect(wrong.status).toBe(405);
		expect(wrong.headers.get('Allow')).toBe('POST');
		expect((await call('PUT', '/accounts/me')).headers.get('Allow')).toBe('GET, PATCH');
		expect((await call('GET', '/accounts/session')).headers.get('Allow')).toBe('POST, DELETE');
	});

	it('answers CORS preflight for account routes', async () => {
		for (const path of ['/accounts', '/accounts/session', '/accounts/me']) {
			const response = await call('OPTIONS', path);
			expect(response.status).toBe(204);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
			expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
			expect(response.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
			expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
		}
	});
});

describe('quick account sessions', () => {
	it('keeps at most 10 sessions and evicts the least recently used', async () => {
		const username = uniqueUsername('cap');
		const first = await signup(username);
		const tokens: string[] = [];
		for (let index = 1; index < ACCOUNT_LIMITS.maxSessions; index += 1) {
			tokens.push((await readJson<SessionBody>(await login(username))).token);
		}
		expect(await countRows(username, 'sessions')).toBe(ACCOUNT_LIMITS.maxSessions);

		await getMe(first.token); // refresh the oldest session so the second-oldest becomes LRU
		const newest = await readJson<SessionBody>(await login(username));

		expect(await countRows(username, 'sessions')).toBe(ACCOUNT_LIMITS.maxSessions);
		await getMe(first.token);
		await getMe(newest.token);
		await expectError(await call('GET', '/accounts/me', { token: tokens[0] }), 401, 'UNAUTHORIZED');
		await getMe(tokens[1] ?? '');
	});

	it('expires sessions after 180 idle days', async () => {
		const username = uniqueUsername('idle');
		const { token } = await signup(username);

		await runInDurableObject(actorStub(username), (_instance, state) => {
			state.storage.sql.exec(`UPDATE sessions SET last_used_at_ms = last_used_at_ms - ?`, ACCOUNT_LIMITS.sessionIdleMs + 1000);
		});

		await expectError(await call('GET', '/accounts/me', { token }), 401, 'UNAUTHORIZED');
		expect(await verifyAccountToken(env, token)).toBeNull();
		expect(await countRows(username, 'sessions')).toBe(0);
	});
});

describe('account history recorded by rooms', () => {
	it('records words idempotently and derives stats and memory', async () => {
		const username = uniqueUsername('words');
		const { token } = await signup(username);
		const events = [
			wordEvent({ wordId: 'w-apple', role: 'drew', atMs: 1_000, solved: true, solveMs: 9_000, points: 80 }),
			wordEvent({ wordId: 'w-boat', role: 'offered', atMs: 1_000 }),
			wordEvent({ wordId: 'w-cloud', role: 'seen-report', atMs: 1_000 }),
			wordEvent({ wordId: 'w-drum', role: 'guessed', atMs: 2_000, solved: true, solveMs: 5_000, points: 70 }),
			wordEvent({ wordId: 'w-eel', role: 'unknown-report', atMs: 3_000 }),
			wordEvent({ wordId: 'w-fig', role: 'missed', atMs: 4_000, solved: false }),
			wordEvent({ wordId: 'w-boat', role: 'guessed', atMs: 5_000, roomCode: 'ROOM2', solved: true }),
			wordEvent({ wordId: 'w-apple', role: 'drew', atMs: 6_000, roomCode: 'ROOM2' }),
			wordEvent({ wordId: 'w-gum', role: 'drew', atMs: 7_000, roomCode: 'ROOM2' }),
		];

		await recordAccountWords(env, username, events);
		await recordAccountWords(env, username, [...events].reverse());

		const profile = await getMe(token);
		expect(profile.recentWords).toHaveLength(events.length);
		expect(profile.recentWords.map((event) => event.atMs)).toEqual([7_000, 6_000, 5_000, 4_000, 3_000, 2_000, 1_000, 1_000, 1_000]);
		expect(profile.recentWords[0]).toEqual(events[8]);
		expect(profile.stats.distinctWordsDrawn).toBe(2);
		expect(profile.avoidedWordCount).toBe(3);

		const verified = await verifyAccountToken(env, token);
		expect(verified).toEqual({
			accountId: username,
			displayName: username,
			memory: {
				avoid: ['w-gum', 'w-apple', 'w-cloud'],
				soft: ['w-boat', 'w-fig', 'w-eel', 'w-drum'],
			},
		});
	});

	it('drops malformed word events but keeps valid ones from the same batch', async () => {
		const username = uniqueUsername('junk');
		const { token } = await signup(username);
		const valid = wordEvent({ wordId: 'w-kite', role: 'drew', atMs: 10 });
		const malformed = [
			{ ...valid, role: 'painted' },
			{ ...valid, atMs: Number.NaN },
			{ ...valid, wordId: '' },
		];

		await runInDurableObject(actorStub(username), async (instance) => {
			expect(await instance.recordWords([...malformed, valid] as unknown as WordHistoryEvent[])).toBe(1);
		});
		expect((await getMe(token)).recentWords).toEqual([valid]);
	});

	it('folds match summaries into lifetime stats once per room match', async () => {
		const username = uniqueUsername('stats');
		const { token } = await signup(username);
		const win = matchSummary(
			{ matchNumber: 1, result: 'win' },
			{
				roundsDrawn: 2,
				drawingsSolved: 2,
				drawerSolveMsTotal: 30_000,
				guessesSubmitted: 10,
				correctGuesses: 3,
				closeGuesses: 2,
				timeToCorrectMsTotal: 40_000,
				fastestCorrectMs: 6_000,
				hardWordsSolved: 1,
				pointsWon: 210,
				showdownCardsDrawn: 1,
				showdownCardsGuessed: 2,
			},
		);
		const loss = matchSummary(
			{ matchNumber: 2, result: 'loss', endedReason: 'surrender' },
			{ roundsDrawn: 1, guessesSubmitted: 4, correctGuesses: 1, fastestCorrectMs: 4_500, pointsWon: 90 },
		);
		const tie = matchSummary(
			{ matchNumber: 1, roomCode: 'OTHER', result: 'tie', endedAtMs: loss.endedAtMs + 60_000 },
			{ fastestCorrectMs: null },
		);

		await recordAccountMatch(env, username, win);
		await recordAccountMatch(env, username, loss);
		await recordAccountMatch(env, username, win);
		await recordAccountMatch(env, username, { ...loss, result: 'win' });
		await recordAccountMatch(env, username, tie);

		const profile = await getMe(token);
		expect(profile.stats).toEqual({
			...EMPTY_ACCOUNT_STATS,
			matchesPlayed: 3,
			wins: 1,
			losses: 1,
			ties: 1,
			roundsDrawn: 3,
			drawingsSolved: 2,
			drawerSolveMsTotal: 30_000,
			guessesSubmitted: 14,
			correctGuesses: 4,
			closeGuesses: 2,
			timeToCorrectMsTotal: 40_000,
			fastestCorrectMs: 4_500,
			hardWordsSolved: 1,
			pointsWon: 300,
			showdownCardsDrawn: 1,
			showdownCardsGuessed: 2,
		});
		expect(profile.recentMatches.map((match) => `${match.roomCode}#${match.matchNumber}`)).toEqual(['OTHER#1', 'MATCH#2', 'MATCH#1']);
		expect(profile.recentMatches[1]).toEqual(loss);
	});

	it('caps stored history and returns the newest slice in the profile', async () => {
		const username = uniqueUsername('caps');
		const { token } = await signup(username);
		const extraWords = 5;
		const words = Array.from({ length: ACCOUNT_LIMITS.storedWordEvents + extraWords }, (_, index) =>
			wordEvent({ wordId: `w-${index}`, role: index % 2 === 0 ? 'drew' : 'offered', atMs: 10_000 + index }),
		);
		const matches = Array.from({ length: ACCOUNT_LIMITS.storedMatches + 5 }, (_, index) => matchSummary({ matchNumber: index + 1 }));

		await recordAccountWords(env, username, words);
		for (const match of matches) await recordAccountMatch(env, username, match);

		expect(await countRows(username, 'word_events')).toBe(ACCOUNT_LIMITS.storedWordEvents);
		expect(await countRows(username, 'matches')).toBe(ACCOUNT_LIMITS.storedMatches);
		const profile = await getMe(token);
		expect(profile.recentWords).toHaveLength(ACCOUNT_LIMITS.profileWordEvents);
		expect(profile.recentWords[0]?.wordId).toBe(`w-${words.length - 1}`);
		expect(profile.recentMatches).toHaveLength(ACCOUNT_LIMITS.profileMatches);
		expect(profile.recentMatches[0]?.matchNumber).toBe(matches.length);
		expect(profile.stats.matchesPlayed).toBe(matches.length);
		// Lifetime stats survive history trimming.
		expect(profile.stats.distinctWordsDrawn).toBe(Math.ceil(words.length / 2));
		expect(profile.avoidedWordCount).toBe(ACCOUNT_LIMITS.storedWordEvents / 2);

		const verified = await verifyAccountToken(env, token);
		expect(verified?.memory.avoid[0]).toBe(`w-${words.length - 1}`);
		expect(verified?.memory.avoid).toHaveLength(ACCOUNT_LIMITS.storedWordEvents / 2);
		expect(verified?.memory.soft).toHaveLength(ACCOUNT_LIMITS.storedWordEvents / 2);
	});

	it('returns null from verify for malformed or revoked tokens', async () => {
		const username = uniqueUsername('verify');
		const { token } = await signup(username);

		expect(await verifyAccountToken(env, '')).toBeNull();
		expect(await verifyAccountToken(env, 'nodot')).toBeNull();
		expect(await verifyAccountToken(env, `${username}.short`)).toBeNull();
		expect(await verifyAccountToken(env, `${username}.${'b'.repeat(43)}`)).toBeNull();
		expect((await verifyAccountToken(env, token))?.accountId).toBe(username);

		await call('DELETE', '/accounts/session', { token });
		expect(await verifyAccountToken(env, token)).toBeNull();
	});
});

describe('readJsonBody', () => {
	const post = (body: BodyInit | null, headers: HeadersInit = {}) =>
		new Request('https://example.com/x', { method: 'POST', headers, body });

	it('accepts a JSON object up to the cap and nothing larger', async () => {
		const pad = (bytes: number) => JSON.stringify({ a: 'x'.repeat(bytes - 8) });
		expect(new TextEncoder().encode(pad(MAX_JSON_BODY_BYTES)).byteLength).toBe(MAX_JSON_BODY_BYTES);
		expect(await readJsonBody(post(pad(MAX_JSON_BODY_BYTES)))).toMatchObject({ ok: true });
		expect(await readJsonBody(post(pad(MAX_JSON_BODY_BYTES + 1)))).toEqual({ ok: false, reason: 'too-large' });
		expect(await readJsonBody(post('{"a":1}'), 4)).toEqual({ ok: false, reason: 'too-large' });
		expect(await readJsonBody(post('{"a":1}'))).toEqual({ ok: true, value: { a: 1 } });
	});

	it('stops reading a body without a length once it passes the cap', async () => {
		let pulled = 0;
		let cancelled = false;
		const chunk = new TextEncoder().encode('x'.repeat(4096));
		const endless = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled += 1;
				controller.enqueue(chunk);
			},
			cancel() {
				cancelled = true;
			},
		});
		const request = post(null);
		Object.defineProperty(request, 'body', { value: endless });
		expect(await readJsonBody(request)).toEqual({ ok: false, reason: 'too-large' });
		expect(pulled).toBeLessThanOrEqual(MAX_JSON_BODY_BYTES / chunk.byteLength + 2);
		expect(cancelled).toBe(true);
	});

	it('calls empty, malformed, non-UTF-8, and non-object bodies invalid', async () => {
		for (const body of [null, '', ' ', '{', '[1]', '1', 'null', new Uint8Array([0x7b, 0xff, 0x7d])]) {
			expect(await readJsonBody(post(body))).toEqual({ ok: false, reason: 'invalid' });
		}
	});
});

describe('account pure helpers', () => {
	it('takes the minimum fastest guess and keeps null when nothing is known', () => {
		const base = { ...EMPTY_ACCOUNT_STATS, fastestCorrectMs: 5_000 };
		expect(foldMatchIntoStats(base, matchSummary({ matchNumber: 1 }, { fastestCorrectMs: null })).fastestCorrectMs).toBe(5_000);
		expect(foldMatchIntoStats(base, matchSummary({ matchNumber: 1 }, { fastestCorrectMs: 7_000 })).fastestCorrectMs).toBe(5_000);
		expect(foldMatchIntoStats(EMPTY_ACCOUNT_STATS, matchSummary({ matchNumber: 1 })).fastestCorrectMs).toBeNull();
	});

	it('caps derived memory lists at WORD_MEMORY_LIMITS', () => {
		const entries = Array.from({ length: 1_400 }, (_, index) => ({
			wordId: `w-${index}`,
			role: index < 700 ? ('drew' as const) : ('missed' as const),
		}));
		const memory = deriveWordMemory(entries);
		expect(memory.avoid).toHaveLength(WORD_MEMORY_LIMITS.avoid);
		expect(memory.soft).toHaveLength(WORD_MEMORY_LIMITS.soft);
		expect(memory.avoid[0]).toBe('w-0');
		expect(memory.soft[0]).toBe('w-700');
	});

	it('defaults corrupt or partial stored stats', () => {
		expect(parseStoredStats('{oops')).toEqual(EMPTY_ACCOUNT_STATS);
		expect(parseStoredStats('{"wins":3,"losses":"many"}')).toEqual({ ...EMPTY_ACCOUNT_STATS, wins: 3 });
	});

	it('cleans display names and validates room records', () => {
		expect(sanitizeDisplayName('  a\u0000b   c ')).toBe('a b c');
		expect(sanitizeDisplayName('\u0001')).toBeNull();
		expect(sanitizeDisplayName('\u200b\u200b')).toBeNull();
		expect(sanitizeDisplayName('\u202e')).toBeNull();
		expect(sanitizeDisplayName('\u202eBo\u200bb')).toBe('Bob');
		expect(sanitizeDisplayName('x'.repeat(40))).toHaveLength(ACCOUNT_LIMITS.maxDisplayNameLength);
		expect(sanitizeWordEvent({ ...wordEvent({ wordId: 'w-a', role: 'drew', atMs: 1 }), extra: 'dropped' })).not.toHaveProperty('extra');
		expect(sanitizeMatchSummary({ ...matchSummary({ matchNumber: 1 }), stats: { ...EMPTY_MEMBER_MATCH_STATS, pointsWon: -1 } })).toBeNull();
	});
});
