import { handleAccountsRequest } from './accounts/routes';
import type { Env } from './env';
import { jsonResponse, methodNotAllowed, notFound, preflightResponse } from './http';
import { handleRoomsRequest, normalizeRoomCode } from './room/routes';

export { AccountActor } from './accounts/account-actor';
export type { Env } from './env';
export { GameRoom } from './room/game-room';
export { normalizeRoomCode };

const worker = {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'OPTIONS') return preflightResponse();

		if (url.pathname === '/health') {
			if (request.method !== 'GET') return methodNotAllowed('GET');
			return jsonResponse({ status: 'ok' }, 200, { 'Cache-Control': 'no-store' });
		}

		if (url.pathname === '/rooms' || url.pathname.startsWith('/rooms/')) {
			return handleRoomsRequest(request, env, url);
		}

		if (url.pathname === '/accounts' || url.pathname.startsWith('/accounts/')) {
			return handleAccountsRequest(request, env, url);
		}

		return notFound();
	},
} satisfies ExportedHandler<Env>;

export default worker;
