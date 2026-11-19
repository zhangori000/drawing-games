import { ACCOUNT_LIMITS } from './limits';

/**
 * Password and session-token primitives, WebCrypto only.
 * SECURITY: passwords, tokens, and anything derived from them must never be
 * logged or returned to a client. Only the PBKDF2 hash and SHA-256 token
 * hashes are persisted.
 */
export interface StoredPassword {
	/** base64url PBKDF2-SHA-256 output. */
	readonly hash: string;
	/** base64url random salt. */
	readonly salt: string;
	readonly iterations: number;
}

const encoder = new TextEncoder();

export async function hashPassword(password: string): Promise<StoredPassword> {
	const iterations = ACCOUNT_LIMITS.pbkdf2Iterations;
	const salt = randomBytes(ACCOUNT_LIMITS.saltBytes);
	const derived = await derivePasswordKey(password, salt, iterations);
	return { hash: encodeBase64Url(derived), salt: encodeBase64Url(salt), iterations };
}

export async function verifyPassword(password: string, stored: StoredPassword): Promise<boolean> {
	const salt = decodeBase64Url(stored.salt);
	const expected = decodeBase64Url(stored.hash);
	if (salt === null || expected === null) return false;
	const actual = await derivePasswordKey(password, salt, stored.iterations);
	return constantTimeEqual(actual, expected);
}

/** `<username>.<base64url random bytes>`; the prefix routes to the actor. */
export function createSessionToken(username: string): string {
	return `${username}.${encodeBase64Url(randomBytes(ACCOUNT_LIMITS.tokenRandomBytes))}`;
}

/** SHA-256 of the whole token (prefix included), hex encoded. */
export async function hashSessionToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
	return encodeHex(new Uint8Array(digest));
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.byteLength !== b.byteLength) return false;
	return crypto.subtle.timingSafeEqual(a, b);
}

async function derivePasswordKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	// NFC so the same password typed on different keyboards hashes the same.
	const material = await crypto.subtle.importKey('raw', encoder.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
		material,
		ACCOUNT_LIMITS.derivedKeyBytes * 8,
	);
	return new Uint8Array(bits);
}

function randomBytes(length: number): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(length));
}

export function encodeBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBase64Url(text: string): Uint8Array | null {
	if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
	const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
	try {
		const binary = atob(padded);
		return Uint8Array.from(binary, (char) => char.charCodeAt(0));
	} catch {
		return null;
	}
}

function encodeHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
