import { retryAfterSeconds } from './rate-limit';

/**
 * Shared HTTP helpers. Account and room APIs authenticate with bearer tokens
 * (never cookies), so a wildcard CORS origin grants no ambient authority.
 */
export const CORS_HEADERS: Readonly<Record<string, string>> = Object.freeze({
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Authorization, Content-Type',
	'Access-Control-Max-Age': '600',
	// Lets browsers read when a 429 may be retried.
	'Access-Control-Expose-Headers': 'Retry-After',
});

export function jsonResponse(body: unknown, status: number, headers?: HeadersInit): Response {
	const responseHeaders = new Headers(headers);
	responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
	if (!responseHeaders.has('Cache-Control')) responseHeaders.set('Cache-Control', 'no-store');
	for (const [name, value] of Object.entries(CORS_HEADERS)) responseHeaders.set(name, value);
	return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

export function preflightResponse(): Response {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function methodNotAllowed(allowedMethods: string): Response {
	return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: allowedMethods });
}

export function notFound(): Response {
	return jsonResponse({ error: 'Not found' }, 404);
}

/** 429 with a `Retry-After` header (whole seconds, at least 1). */
export function tooManyRequests(body: unknown, retryAfterMs: number): Response {
	return jsonResponse(body, 429, { 'Retry-After': retryAfterSeconds(retryAfterMs) });
}

export function upgradeRequired(): Response {
	return jsonResponse({ error: 'WebSocket upgrade required' }, 426, { Upgrade: 'websocket' });
}

export function isWebSocketUpgrade(request: Request): boolean {
	return request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
}

/** Largest JSON request body the API reads (account forms are tiny). */
export const MAX_JSON_BODY_BYTES = 16 * 1024;

export type JsonBodyResult =
	| { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
	/** `too-large`: over the cap (answer 413); `invalid`: empty, not UTF-8 JSON, or not an object. */
	| { readonly ok: false; readonly reason: 'too-large' | 'invalid' };

/**
 * Reads a JSON object body of at most `maxBytes`, so an oversized body is
 * never buffered. A declared Content-Length over the cap is refused without
 * touching the body (the runtime discards it; cancelling it here made
 * `wrangler dev` answer 503 instead of the 413). A body without a length is
 * read only until it passes the cap, then cancelled.
 */
export async function readJsonBody(request: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<JsonBodyResult> {
	const declared = Number(request.headers.get('Content-Length') ?? Number.NaN);
	if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: 'too-large' };
	const bytes = request.body === null ? new Uint8Array() : await readAtMost(request.body, maxBytes);
	if (bytes === null) return { ok: false, reason: 'too-large' };
	let value: unknown;
	try {
		value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
	} catch {
		return { ok: false, reason: 'invalid' };
	}
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? { ok: true, value: value as Readonly<Record<string, unknown>> }
		: { ok: false, reason: 'invalid' };
}

/** The whole stream, or null (after cancelling it) once it passes `maxBytes`. */
async function readAtMost(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array | null> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel().catch(() => undefined);
			return null;
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

export function bearerToken(request: Request): string | null {
	const header = request.headers.get('Authorization') ?? '';
	const match = /^Bearer\s+(\S+)$/i.exec(header);
	return match?.[1] ?? null;
}
