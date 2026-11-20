import { roomCodeSchema, sessionIdSchema } from '@drawing-games/protocol';

import { takeClientToken } from '../client-limits';
import type { Env } from '../env';
import { isWebSocketUpgrade, jsonResponse, methodNotAllowed, notFound, tooManyRequests, upgradeRequired } from '../http';
import { ROOM_CREATE_ATTEMPTS } from './constants';
import { generateRoomCode } from './secrets';

const ROOM_ROUTE = /^\/rooms(?:\/([^/]+)(\/socket)?)?\/?$/;
const LOOKUP_LIMITED = 'Too many room lookups from this network. Try again in a moment.';

/**
 * Handles `/rooms` (POST create), `/rooms/:code` (GET info), and
 * `/rooms/:code/socket` (WebSocket). The room module owns this file.
 * Creating rooms and looking codes up (info or socket) are limited per
 * client address (`client-limits.ts`).
 */
export async function handleRoomsRequest(request: Request, env: Env, url: URL): Promise<Response> {
	const match = ROOM_ROUTE.exec(url.pathname);
	if (match === null) return notFound();
	const [, rawCode, socketSuffix] = match;

	if (rawCode === undefined) {
		if (request.method !== 'POST') return methodNotAllowed('POST');
		const retryAfterMs = takeClientToken(request, 'roomCreate');
		return retryAfterMs > 0 ? rateLimited('Too many new rooms from this network. Try again in a moment.', retryAfterMs) : createRoom(env);
	}
	if (socketSuffix === undefined) {
		if (request.method !== 'GET') return methodNotAllowed('GET');
		const retryAfterMs = takeClientToken(request, 'roomLookup');
		return retryAfterMs > 0 ? rateLimited(LOOKUP_LIMITED, retryAfterMs) : roomInfo(env, rawCode);
	}

	if (request.method !== 'GET') return methodNotAllowed('GET');
	if (!isWebSocketUpgrade(request)) return upgradeRequired();
	// A refused upgrade looks like a network failure, so clients retry it with backoff.
	const retryAfterMs = takeClientToken(request, 'roomLookup');
	if (retryAfterMs > 0) return rateLimited(LOOKUP_LIMITED, retryAfterMs);

	const roomCode = normalizeRoomCode(rawCode);
	const sessionIdResult = sessionIdSchema.safeParse(url.searchParams.get('sessionId'));
	if (roomCode === null || !sessionIdResult.success || url.searchParams.getAll('sessionId').length !== 1) {
		return jsonResponse({ error: 'Invalid room code or sessionId' }, 400);
	}

	const internalUrl = new URL('https://game-room.internal/socket');
	internalUrl.searchParams.set('roomCode', roomCode);
	internalUrl.searchParams.set('sessionId', sessionIdResult.data);
	const stub = env.GAME_ROOM.getByName(roomCode);
	return stub.fetch(new Request(internalUrl, { method: 'GET', headers: request.headers }));
}

/** Random codes until one is free; each room's actor decides atomically. */
async function createRoom(env: Env): Promise<Response> {
	for (let attempt = 0; attempt < ROOM_CREATE_ATTEMPTS; attempt += 1) {
		const roomCode = generateRoomCode();
		if (await env.GAME_ROOM.getByName(roomCode).create(roomCode)) {
			return jsonResponse({ roomCode }, 201);
		}
	}
	return jsonResponse({ error: 'Could not allocate a room code. Try again.' }, 503);
}

async function roomInfo(env: Env, rawCode: string): Promise<Response> {
	const roomCode = normalizeRoomCode(rawCode);
	if (roomCode === null) return jsonResponse({ error: 'Invalid room code' }, 400);
	const info = await env.GAME_ROOM.getByName(roomCode).info();
	return jsonResponse(info, 200);
}

function rateLimited(error: string, retryAfterMs: number): Response {
	return tooManyRequests({ error, code: 'RATE_LIMITED', retryAfterMs }, retryAfterMs);
}

export function normalizeRoomCode(rawRoomCode: string): string | null {
	let decoded: string;
	try {
		decoded = decodeURIComponent(rawRoomCode);
	} catch {
		return null;
	}
	const result = roomCodeSchema.safeParse(decoded.trim().toUpperCase());
	return result.success ? result.data : null;
}
