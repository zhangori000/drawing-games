import { KeyedRateLimiter, type TokenBucketPolicy } from './rate-limit';

/**
 * Per-client limits for the HTTP API, keyed by the caller's address
 * (`CF-Connecting-IP`, set by Cloudflare's edge and by `wrangler dev`; IPv6
 * by /64). Sized so a household, a classroom behind one NAT, or a developer
 * with many tabs never meets them; they only stop floods.
 *
 * Requests without an address (unit tests calling the Worker directly) or
 * from loopback (a browser on the machine running `wrangler dev`) are not
 * limited, so local multi-tab testing and the e2e suite are unaffected;
 * phones on the LAN are limited like anyone else.
 *
 * The buckets live in each Worker isolate's memory: a best-effort first line
 * that needs no configuration. A deployment that wants global limits should
 * add a Cloudflare rate-limiting rule (or binding) on the same routes.
 */
export const CLIENT_RATE_LIMITS = Object.freeze({
	/** `POST /rooms`: 30 back to back, then one every 2 s. */
	roomCreate: { capacity: 30, refillPerSecond: 1 / 2 },
	/** `GET /rooms/:code` and socket upgrades (code probing): 120, then 2/s. */
	roomLookup: { capacity: 120, refillPerSecond: 2 },
	/** `POST /accounts` (a PBKDF2 hash and a new actor each): 20, then one every 30 s. */
	signup: { capacity: 20, refillPerSecond: 1 / 30 },
	/** `POST /accounts/session` across usernames (per-account lockout is separate): 30, then one every 5 s. */
	login: { capacity: 30, refillPerSecond: 1 / 5 },
} satisfies Record<string, TokenBucketPolicy>);

export type ClientLimitName = keyof typeof CLIENT_RATE_LIMITS;

const limiters: Readonly<Record<ClientLimitName, KeyedRateLimiter>> = {
	roomCreate: new KeyedRateLimiter(CLIENT_RATE_LIMITS.roomCreate),
	roomLookup: new KeyedRateLimiter(CLIENT_RATE_LIMITS.roomLookup),
	signup: new KeyedRateLimiter(CLIENT_RATE_LIMITS.signup),
	login: new KeyedRateLimiter(CLIENT_RATE_LIMITS.login),
};

/**
 * Spends one of the caller's `name` tokens. Returns 0 when the request may
 * go ahead (or is not limited), else the ms until the client may retry.
 */
export function takeClientToken(request: Request, name: ClientLimitName, nowMs = Date.now()): number {
	const key = clientAddressKey(request.headers.get('CF-Connecting-IP'));
	return key === null ? 0 : limiters[name].take(key, nowMs);
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const IPV4_MAPPED = /^(?:::ffff:|(?:0{1,4}:){5}ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/;
const MAX_RAW_KEY_LENGTH = 64;

/**
 * The limit key for a client address: `v4:<address>`, `v6:<first 64 bits>`
 * (one subscriber usually holds a whole /64), or `raw:<text>` for anything
 * unparsable. Null when there is no address or it is loopback.
 */
export function clientAddressKey(header: string | null): string | null {
	const address = (header ?? '').trim().toLowerCase();
	if (address.length === 0) return null;
	const v4 = IPV4_MAPPED.exec(address)?.[1] ?? (IPV4.test(address) ? address : null);
	if (v4 !== null) return v4.startsWith('127.') ? null : `v4:${v4}`;
	const groups = expandIpv6(address);
	if (groups === null) return `raw:${address.slice(0, MAX_RAW_KEY_LENGTH)}`;
	if (groups.every((group, index) => group === (index === 7 ? '1' : '0'))) return null;
	return `v6:${groups.slice(0, 4).join(':')}`;
}

/** Eight canonical hex groups (no leading zeros), or null if not IPv6. */
function expandIpv6(address: string): string[] | null {
	const bare = address.split('%')[0] ?? '';
	if (!/^[0-9a-f:]+$/.test(bare)) return null;
	const halves = bare.split('::');
	if (halves.length > 2) return null;
	const head = halves[0] ? halves[0].split(':') : [];
	const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
	const missing = 8 - head.length - tail.length;
	if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
	const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
	if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;
	return groups.map((group) => group.replace(/^0+(?=.)/, ''));
}
