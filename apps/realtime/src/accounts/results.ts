import type { AccountProfileView } from '@drawing-games/game-core';
import type { AccountErrorBody } from '@drawing-games/protocol';

/** Structured-clone-safe results returned by `AccountActor` RPC methods. */
export type AccountErrorCode = AccountErrorBody['code'];

export interface AccountFailure {
	readonly ok: false;
	readonly code: AccountErrorCode;
	readonly error: string;
	/** Set with `RATE_LIMITED`: how long until another attempt is allowed. */
	readonly retryAfterMs?: number;
}

export interface AccountSessionSuccess {
	readonly ok: true;
	readonly token: string;
	readonly profile: AccountProfileView;
}

export type AccountSessionResult = AccountSessionSuccess | AccountFailure;

export type AccountProfileResult = { readonly ok: true; readonly profile: AccountProfileView } | AccountFailure;

export function accountFailure(code: AccountErrorCode, error: string, retryAfterMs?: number): AccountFailure {
	return retryAfterMs === undefined ? { ok: false, code, error } : { ok: false, code, error, retryAfterMs };
}

/** User-facing messages; they never echo submitted values. */
export const ACCOUNT_MESSAGES = Object.freeze({
	usernameTaken: 'That username is taken. Try another one.',
	invalidCredentials: 'That username and password don’t match.',
	unauthorized: 'You’ve been signed out. Sign in again.',
	invalidDisplayName: 'Display names need at least one visible character.',
	bodyTooLarge: 'Payload too large.',
	bodyNotObject: 'Body must be a JSON object.',
	internal: 'The account server had a problem. Try again in a moment.',
});

export function rateLimitedMessage(retryAfterMs: number): string {
	return `Too many sign-in attempts. Try again in ${minutesText(retryAfterMs)}.`;
}

export function tooManySignupsMessage(retryAfterMs: number): string {
	return `Too many new accounts from this network. Try again in ${minutesText(retryAfterMs)}.`;
}

/** "1 minute", "3 minutes" (rounded up, at least 1). */
function minutesText(retryAfterMs: number): string {
	const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
	return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
