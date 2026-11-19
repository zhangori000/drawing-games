import { roomCodeSchema, sessionIdSchema } from '@drawing-games/protocol';

import type { Env } from '../env';
import { isWebSocketUpgrade, jsonResponse, methodNotAllowed, notFound, upgradeRequired } from '../http';
import { ROOM_CREATE_ATTEMPTS } from './constants';
import { generateRoomCode } from './secrets';

const ROOM_ROUTE = /^\/rooms(?:\/([^/]+)(\/socket)?)?\/?$/;

/**
 * Handles `/rooms` (POST create), `/rooms/:code` (GET info), and
 * `/rooms/:code/socket` (WebSocket). The room module owns this file.
 */
export async function handleRoomsRequest(request: Request, env: Env, url: URL): Promise<Response> {
	const match = ROOM_ROUTE.exec(url.pathname);
	if (match === null) return notFound();
	const [, rawCode, socketSuffix] = match;

	if (rawCode === undefined) {
		return request.method === 'POST' ? createRoom(env) : methodNotAllowed('POST');
	}
	if (socketSuffix === undefined) {
		return request.method === 'GET' ? roomInfo(env, rawCode) : methodNotAllowed('GET');
	}

	if (request.method !== 'GET') return methodNotAllowed('GET');
	if (!isWebSocketUpgrade(request)) return upgradeRequired();

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
