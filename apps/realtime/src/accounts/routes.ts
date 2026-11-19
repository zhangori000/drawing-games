import type { Env } from '../env';
import { jsonResponse } from '../http';

/** Handles every `/accounts...` route. CONTRACT STUB. */
export async function handleAccountsRequest(_request: Request, _env: Env, _url: URL): Promise<Response> {
	return jsonResponse({ error: 'Accounts are not implemented yet', code: 'INTERNAL' }, 501);
}
