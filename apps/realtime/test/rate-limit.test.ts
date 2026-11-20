import { describe, expect, it } from 'vitest';

import { clientAddressKey } from '../src/client-limits';
import { KeyedRateLimiter, TokenBucket, retryAfterSeconds } from '../src/rate-limit';
import { commandLane } from '../src/room/command-limiter';

describe('TokenBucket', () => {
	it('allows a full burst, then refills at the sustained rate', () => {
		const bucket = new TokenBucket({ capacity: 3, refillPerSecond: 2 }, 1_000);
		expect([bucket.take(1_000), bucket.take(1_000), bucket.take(1_000)]).toEqual([0, 0, 0]);
		// Empty: the next token is 500 ms away.
		expect(bucket.take(1_000)).toBe(500);
		expect(bucket.take(1_250)).toBe(250);
		expect(bucket.take(1_500)).toBe(0);
		// Refill never exceeds the capacity.
		const later = 60_000;
		expect([bucket.take(later), bucket.take(later), bucket.take(later)]).toEqual([0, 0, 0]);
		expect(bucket.take(later)).toBeGreaterThan(0);
	});

	it('does not refill when the clock moves backwards', () => {
		const bucket = new TokenBucket({ capacity: 1, refillPerSecond: 1 }, 10_000);
		expect(bucket.take(10_000)).toBe(0);
		expect(bucket.take(5_000)).toBe(1_000);
		expect(bucket.take(5_500)).toBe(500);
		expect(bucket.take(6_000)).toBe(0);
	});
});

describe('KeyedRateLimiter', () => {
	it('keeps one bucket per key', () => {
		const limiter = new KeyedRateLimiter({ capacity: 1, refillPerSecond: 1 });
		expect(limiter.take('a', 0)).toBe(0);
		expect(limiter.take('a', 0)).toBe(1_000);
		expect(limiter.take('b', 0)).toBe(0);
		limiter.forget('a');
		expect(limiter.take('a', 0)).toBe(0);
	});

	it('forgets the least recently used key when full (failing open)', () => {
		const limiter = new KeyedRateLimiter({ capacity: 1, refillPerSecond: 1 }, 2);
		limiter.take('a', 0);
		limiter.take('b', 0);
		// Touching `a` makes `b` the oldest.
		expect(limiter.take('a', 0)).toBeGreaterThan(0);
		limiter.take('c', 0);
		expect(limiter.size).toBe(2);
		expect(limiter.take('a', 0)).toBeGreaterThan(0);
		expect(limiter.take('b', 0)).toBe(0);
	});

	it('formats Retry-After as whole seconds, at least one', () => {
		expect(retryAfterSeconds(1)).toBe('1');
		expect(retryAfterSeconds(1_000)).toBe('1');
		expect(retryAfterSeconds(1_001)).toBe('2');
	});
});

describe('clientAddressKey', () => {
	it('keys IPv4 by address and IPv6 by /64', () => {
		expect(clientAddressKey('203.0.113.9')).toBe('v4:203.0.113.9');
		expect(clientAddressKey(' 203.0.113.9 ')).toBe('v4:203.0.113.9');
		expect(clientAddressKey('2001:db8:0:1:aaaa::1')).toBe('v6:2001:db8:0:1');
		expect(clientAddressKey('2001:0DB8:0000:0001:ffff:0:0:2')).toBe('v6:2001:db8:0:1');
		expect(clientAddressKey('2001:db8::')).toBe('v6:2001:db8:0:0');
		expect(clientAddressKey('fe80::1%eth0')).toBe('v6:fe80:0:0:0');
		expect(clientAddressKey('::ffff:198.51.100.7')).toBe('v4:198.51.100.7');
	});

	it('does not limit requests without an address or from loopback', () => {
		expect(clientAddressKey(null)).toBeNull();
		expect(clientAddressKey('')).toBeNull();
		expect(clientAddressKey('127.0.0.1')).toBeNull();
		expect(clientAddressKey('127.8.9.10')).toBeNull();
		expect(clientAddressKey('::1')).toBeNull();
		expect(clientAddressKey('0:0:0:0:0:0:0:1')).toBeNull();
		expect(clientAddressKey('::ffff:127.0.0.1')).toBeNull();
	});

	it('keys anything unparsable by its (bounded) text', () => {
		expect(clientAddressKey('not-an-ip')).toBe('raw:not-an-ip');
		expect(clientAddressKey('1:2:3')).toBe('raw:1:2:3');
		expect(clientAddressKey('x'.repeat(200))).toBe(`raw:${'x'.repeat(64)}`);
	});
});

describe('commandLane', () => {
	it('puts drawing batches in their own lane and everything else in control', () => {
		expect(commandLane({ command: { type: 'drawing.batch', operations: [] } })).toBe('drawing');
		expect(commandLane({ command: { type: 'lobby.ready', ready: true } })).toBe('control');
		expect(commandLane({ command: 'drawing.batch' })).toBe('control');
		expect(commandLane(null)).toBe('control');
		expect(commandLane([1, 2])).toBe('control');
	});
});
