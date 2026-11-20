import type { AccountErrorBody } from '@drawing-games/protocol';
import { exports as workerExports } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLIENT_RATE_LIMITS } from '../src/client-limits';
import { PASSWORD, uniqueUsername } from './accounts/helpers';

/** Buckets live in the Worker isolate, which tests share: one address per test. */
function request(path: string, address: string | null, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers);
	if (address !== null) headers.set('CF-Connecting-IP', address);
	return workerExports.default.fetch(new Request(`https://example.com${path}`, { ...init, headers }));
}

function postJson(path: string, address: string, body: unknown): Promise<Response> {
	return request(path, address, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function statuses(count: number, send: () => Promise<Response>): Promise<number[]> {
	const result: number[] = [];
	for (let index = 0; index < count; index += 1) {
		const response = await send();
		result.push(response.status);
		await response.body?.cancel();
	}
	return result;
}

// Frozen clock: buckets refill only when a test moves time on.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
});

afterEach(() => {
	vi.useRealTimers();
});

// Each limit is exercised to its real capacity (up to ~120 requests per test).
describe('per-client HTTP limits', { timeout: 30_000 }, () => {
	it('limits room creation per address, with Retry-After, and refills over time', async () => {
		const { capacity } = CLIENT_RATE_LIMITS.roomCreate;
		const create = (address: string) => request('/rooms', address, { method: 'POST' });

		expect(new Set(await statuses(capacity, () => create('203.0.113.10')))).toEqual(new Set([201]));
		const limited = await create('203.0.113.10');
		expect(limited.status).toBe(429);
		expect(limited.headers.get('Retry-After')).toBe('2');
		expect(limited.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(limited.headers.get('Access-Control-Expose-Headers')).toContain('Retry-After');
		expect(await limited.json()).toMatchObject({ code: 'RATE_LIMITED', retryAfterMs: 2_000 });

		// Another address is unaffected.
		expect((await create('203.0.113.11')).status).toBe(201);
		vi.setSystemTime(Date.now() + 2_000);
		expect((await create('203.0.113.10')).status).toBe(201);
		expect((await create('203.0.113.10')).status).toBe(429);
	});

	// An unparsable code is answered 400 without waking a room, but a lookup still counts.
	const PROBE = '/rooms/not-a-code!';

	it('counts info lookups and socket upgrades together, per IPv6 /64', async () => {
		const { capacity } = CLIENT_RATE_LIMITS.roomLookup;
		const lookup = (address: string) => request(PROBE, address);
		const firstHalf = await statuses(capacity / 2, () => lookup('2001:db8:aa:1::1'));
		const secondHalf = await statuses(capacity / 2, () => lookup('2001:db8:aa:1:ffff::2'));
		expect(new Set([...firstHalf, ...secondHalf])).toEqual(new Set([400]));
		expect((await lookup('2001:db8:aa:1::3')).status).toBe(429);
		const upgrade = await request('/rooms/ZZZZ8/socket?sessionId=s_limits', '2001:db8:aa:1::4', { headers: { Upgrade: 'websocket' } });
		expect(upgrade.status).toBe(429);
		expect(upgrade.webSocket).toBeNull();
		// A different /64 still gets through, to a real room lookup.
		expect(await (await request('/rooms/ZZZZ8', '2001:db8:aa:2::1')).json()).toEqual({ exists: false, phase: null, memberCount: 0 });
	});

	it('never limits loopback or requests without an address (local dev, tests)', async () => {
		const count = CLIENT_RATE_LIMITS.roomLookup.capacity + 5;
		for (const address of ['127.0.0.1', null]) {
			expect(new Set(await statuses(count, () => request(PROBE, address)))).toEqual(new Set([400]));
		}
	});

	it('limits valid sign-ups per address; invalid forms cost nothing', async () => {
		const address = '198.51.100.20';
		const username = uniqueUsername('lim');
		// Rejected before the limit: these do not spend tokens.
		expect(new Set(await statuses(25, () => postJson('/accounts', address, { username, password: 'short' })))).toEqual(new Set([400]));

		const { capacity } = CLIENT_RATE_LIMITS.signup;
		expect((await postJson('/accounts', address, { username, password: PASSWORD })).status).toBe(201);
		// Taken usernames are answered without hashing, but still count.
		expect(new Set(await statuses(capacity - 1, () => postJson('/accounts', address, { username, password: PASSWORD })))).toEqual(
			new Set([409]),
		);
		const limited = await postJson('/accounts', address, { username: uniqueUsername('lim'), password: PASSWORD });
		expect(limited.status).toBe(429);
		expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
		const body = (await limited.json()) as AccountErrorBody;
		expect(body).toEqual({ code: 'RATE_LIMITED', error: 'Too many new accounts from this network. Try again in 1 minute.' });

		// Logging in has its own budget.
		expect((await postJson('/accounts/session', address, { username, password: PASSWORD })).status).toBe(200);
	});

	it('limits sign-in attempts per address across usernames', async () => {
		const address = '198.51.100.21';
		const { capacity } = CLIENT_RATE_LIMITS.login;
		// One unknown name (one actor) keeps the test fast; the budget is per address, not per name.
		const username = uniqueUsername('nobody');
		const attempt = () => postJson('/accounts/session', address, { username, password: PASSWORD });
		expect(new Set(await statuses(capacity, attempt))).toEqual(new Set([401]));
		const limited = await attempt();
		expect(limited.status).toBe(429);
		expect(((await limited.json()) as AccountErrorBody).code).toBe('RATE_LIMITED');
	});
});
