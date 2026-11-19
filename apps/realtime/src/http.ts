/**
 * Shared HTTP helpers. Account and room APIs authenticate with bearer tokens
 * (never cookies), so a wildcard CORS origin grants no ambient authority.
 */
export const CORS_HEADERS: Readonly<Record<string, string>> = Object.freeze({
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Authorization, Content-Type',
	'Access-Control-Max-Age': '600',
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

export function upgradeRequired(): Response {
	return jsonResponse({ error: 'WebSocket upgrade required' }, 426, { Upgrade: 'websocket' });
}

export function isWebSocketUpgrade(request: Request): boolean {
	return request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
}

/** Reads a JSON body with a size cap; returns undefined on any failure. */
export async function readJsonBody(request: Request, maxBytes = 16 * 1024): Promise<unknown> {
	const text = await request.text().catch(() => '');
	if (text.length === 0 || new TextEncoder().encode(text).byteLength > maxBytes) return undefined;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
}

export function bearerToken(request: Request): string | null {
	const header = request.headers.get('Authorization') ?? '';
	const match = /^Bearer\s+(\S+)$/i.exec(header);
	return match?.[1] ?? null;
}
