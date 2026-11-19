import {
	accountIdFromToken,
	loginRequestSchema,
	signupRequestSchema,
	updateProfileRequestSchema,
	type AccountErrorBody,
} from '@drawing-games/protocol';

import type { Env } from '../env';
import { bearerToken, CORS_HEADERS, jsonResponse, methodNotAllowed, preflightResponse, readJsonBody } from '../http';
import { accountActor } from './actor-name';
import { describeError } from './log';
import { ACCOUNT_MESSAGES, type AccountErrorCode, type AccountFailure } from './results';

const STATUS_BY_CODE: Readonly<Record<AccountErrorCode, number>> = Object.freeze({
	INVALID_INPUT: 400,
	USERNAME_TAKEN: 409,
	INVALID_CREDENTIALS: 401,
	RATE_LIMITED: 429,
	UNAUTHORIZED: 401,
	NOT_FOUND: 404,
	INTERNAL: 500,
});

/**
 * Handles every `/accounts...` route. Auth is a bearer token, never a cookie.
 * SECURITY: bodies carry passwords and headers carry tokens; neither is ever
 * logged or echoed back.
 */
export async function handleAccountsRequest(request: Request, env: Env, url: URL): Promise<Response> {
	if (request.method === 'OPTIONS') return preflightResponse();
	try {
		return await route(request, env, normalizePath(url.pathname));
	} catch (error) {
		console.error('accounts: request failed', describeError(error));
		return accountError('INTERNAL', ACCOUNT_MESSAGES.internal);
	}
}

async function route(request: Request, env: Env, path: string): Promise<Response> {
	const method = request.method;
	switch (path) {
		case '/accounts':
			return method === 'POST' ? signup(request, env) : methodNotAllowed('POST');
		case '/accounts/session':
			if (method === 'POST') return login(request, env);
			if (method === 'DELETE') return logout(request, env);
			return methodNotAllowed('POST, DELETE');
		case '/accounts/me':
			if (method === 'GET') return getMe(request, env);
			if (method === 'PATCH') return updateMe(request, env);
			return methodNotAllowed('GET, PATCH');
		default:
			return accountError('NOT_FOUND', 'Not found');
	}
}

async function signup(request: Request, env: Env): Promise<Response> {
	const parsed = signupRequestSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return invalidInput(parsed.error.issues);
	const result = await accountActor(env, parsed.data.username).signup(parsed.data);
	return result.ok ? jsonResponse({ token: result.token, profile: result.profile }, 201) : failureResponse(result);
}

async function login(request: Request, env: Env): Promise<Response> {
	const parsed = loginRequestSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return invalidInput(parsed.error.issues);
	const result = await accountActor(env, parsed.data.username).login(parsed.data);
	return result.ok ? jsonResponse({ token: result.token, profile: result.profile }, 200) : failureResponse(result);
}

async function logout(request: Request, env: Env): Promise<Response> {
	const session = sessionFrom(request);
	if (session === null) return unauthorized();
	await accountActor(env, session.accountId).logout(session.token);
	return new Response(null, { status: 204, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } });
}

async function getMe(request: Request, env: Env): Promise<Response> {
	const session = sessionFrom(request);
	if (session === null) return unauthorized();
	const profile = await accountActor(env, session.accountId).getProfile(session.token);
	return profile === null ? unauthorized() : jsonResponse(profile, 200);
}

async function updateMe(request: Request, env: Env): Promise<Response> {
	const session = sessionFrom(request);
	if (session === null) return unauthorized();
	const parsed = updateProfileRequestSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return invalidInput(parsed.error.issues);
	const result = await accountActor(env, session.accountId).updateDisplayName(session.token, parsed.data.displayName);
	return result.ok ? jsonResponse(result.profile, 200) : failureResponse(result);
}

interface BearerSession {
	readonly token: string;
	readonly accountId: string;
}

function sessionFrom(request: Request): BearerSession | null {
	const token = bearerToken(request);
	const accountId = token === null ? null : accountIdFromToken(token);
	return token === null || accountId === null ? null : { token, accountId };
}

function normalizePath(pathname: string): string {
	return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

function accountError(code: AccountErrorCode, error: string, headers?: HeadersInit): Response {
	const body: AccountErrorBody = { error, code };
	return jsonResponse(body, STATUS_BY_CODE[code], headers);
}

function failureResponse(failure: AccountFailure): Response {
	const headers: Record<string, string> = {};
	if (failure.retryAfterMs !== undefined) headers['Retry-After'] = String(Math.ceil(failure.retryAfterMs / 1000));
	return accountError(failure.code, failure.error, headers);
}

function unauthorized(): Response {
	return accountError('UNAUTHORIZED', ACCOUNT_MESSAGES.unauthorized);
}

interface ValidationIssue {
	readonly path: readonly PropertyKey[];
	readonly message: string;
}

/** Names the first problem field; zod messages never include submitted values. */
function invalidInput(issues: readonly ValidationIssue[]): Response {
	const [issue] = issues;
	if (issue === undefined) return accountError('INVALID_INPUT', 'Check the form and try again.');
	const field = issue.path.map(String).join('.');
	return accountError('INVALID_INPUT', field.length > 0 ? `${field}: ${issue.message}` : issue.message);
}
