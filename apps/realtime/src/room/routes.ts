import { roomCodeSchema, sessionIdSchema } from '@drawing-games/protocol';

import type { Env } from '../env';
import { isWebSocketUpgrade, jsonResponse, methodNotAllowed, notFound, upgradeRequired } from '../http';

const ROOM_ROUTE = /^\/rooms(?:\/([^/]+)(\/socket)?)?\/?$/;

/**
 * Handles `/rooms` (POST create), `/rooms/:code` (GET info), and
 * `/rooms/:code/socket` (WebSocket). The room module owns this file.
 */
export async function handleRoomsRequest(request: Request, env: Env, url: URL): Promise<Response> {
	const match = ROOM_ROUTE.exec(url.pathname);
	if (match === null) return notFound();
	const [, rawCode, socketSuffix] = match;

	if (rawCode === undefined) return methodNotAllowed('POST');

	if (socketSuffix === undefined) return notFound();

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
