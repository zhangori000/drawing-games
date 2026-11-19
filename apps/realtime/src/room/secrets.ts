import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './constants';

/**
 * Random identifiers and token hashing, WebCrypto only.
 * SECURITY: resume tokens are bearer secrets for a room seat. Only their
 * SHA-256 hashes are stored, and they are never logged.
 */
const encoder = new TextEncoder();

const MEMBER_ID_BYTES = 9;
const RESUME_TOKEN_BYTES = 32;

export function randomBase64Url(byteLength: number): string {
	const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** `m_` + 12 base64url characters. */
export function createMemberId(): string {
	return `m_${randomBase64Url(MEMBER_ID_BYTES)}`;
}

export function createResumeToken(): string {
	return randomBase64Url(RESUME_TOKEN_BYTES);
}

export async function sha256Hex(text: string): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
	let hex = '';
	for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
	return hex;
}

export function randomUint32(): number {
	return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/** The alphabet has 32 symbols, so masking a random byte is unbiased. */
export function generateRoomCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
	let code = '';
	for (const byte of bytes) code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
	return code;
}
