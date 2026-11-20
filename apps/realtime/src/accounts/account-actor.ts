import {
	EMPTY_ACCOUNT_STATS,
	WORD_MEMORY_LIMITS,
	type AccountProfileView,
	type MatchSummaryRecord,
	type PlayerWordMemory,
	type WordHistoryEvent,
} from '@drawing-games/game-core';
import { accountIdFromToken, loginRequestSchema, signupRequestSchema } from '@drawing-games/protocol';
import { DurableObject } from 'cloudflare:workers';

import type { Env } from '../env';
import { accountActorName } from './actor-name';
import { insertAccount, readAccount, writeDisplayName, writeStats, type AccountRecord } from './account-store';
import type { VerifiedAccount } from './client';
import { createSessionToken, hashPassword, hashSessionToken, verifyPassword } from './crypto';
import { avoidedWordIds, insertMatch, insertWordEvents, recentMatches, recentWordEvents, wordRoleEntries } from './history-store';
import { ACCOUNT_LIMITS } from './limits';
import { ACCOUNT_MESSAGES, accountFailure, rateLimitedMessage, type AccountProfileResult, type AccountSessionResult } from './results';
import { accountSchemaExists, createAccountSchema, migrateAccountSchema } from './schema';
import { clearFailedLogins, deleteSession, insertSession, lockoutRemainingMs, recordFailedLogin, touchSession } from './session-store';
import { deriveWordMemory, foldMatchIntoStats } from './stats';
import { sanitizeDisplayName, sanitizeMatchSummary, sanitizeWordEvent } from './validate';

export interface SignupInput {
	readonly username: string;
	readonly password: string;
	readonly displayName?: string;
}

export interface LoginInput {
	readonly username: string;
	readonly password: string;
}

/**
 * One actor per quick account, addressed by `getByName('user:' + username)`.
 * The actor learns its username at signup; until then it has no tables, and
 * login/verify/record calls leave storage untouched.
 *
 * SECURITY: stores a PBKDF2 password hash and SHA-256 session-token hashes.
 * Never log signup/login arguments, tokens, or anything derived from them.
 */
export class AccountActor extends DurableObject<Env> {
	private schemaReady = false;

	async signup(input: SignupInput): Promise<AccountSessionResult> {
		const parsed = signupRequestSchema.safeParse(input);
		if (!parsed.success) return accountFailure('INVALID_INPUT', 'Check the username and password and try again.');
		const { username, password } = parsed.data;
		if (!this.isNamedFor(username)) return accountFailure('INVALID_INPUT', 'That username does not belong to this account.');
		if (this.account() !== null) return accountFailure('USERNAME_TAKEN', ACCOUNT_MESSAGES.usernameTaken);

		// An explicit name must show something; an omitted one is the username.
		const displayName = sanitizeDisplayName(parsed.data.displayName ?? username);
		if (displayName === null) return accountFailure('INVALID_INPUT', ACCOUNT_MESSAGES.invalidDisplayName);

		const storedPassword = await hashPassword(password);
		const token = createSessionToken(username);
		const tokenHash = await hashSessionToken(token);

		// No awaits below: a concurrent signup that won the race is seen here.
		if (this.account() !== null) return accountFailure('USERNAME_TAKEN', ACCOUNT_MESSAGES.usernameTaken);
		const nowMs = Date.now();
		const record: AccountRecord = {
			username,
			displayName,
			password: storedPassword,
			createdAtMs: nowMs,
			stats: EMPTY_ACCOUNT_STATS,
		};
		this.ctx.storage.transactionSync(() => {
			createAccountSchema(this.sql);
			insertAccount(this.sql, record);
			insertSession(this.sql, tokenHash, nowMs);
		});
		this.schemaReady = true;
		return { ok: true, token, profile: this.buildProfile(record) };
	}

	async login(input: LoginInput): Promise<AccountSessionResult> {
		const parsed = loginRequestSchema.safeParse(input);
		if (!parsed.success) return accountFailure('INVALID_INPUT', 'Check the username and password and try again.');
		const account = this.account();
		if (account === null || account.username !== parsed.data.username) {
			return accountFailure('INVALID_CREDENTIALS', ACCOUNT_MESSAGES.invalidCredentials);
		}

		const attemptAtMs = Date.now();
		const lockedForMs = lockoutRemainingMs(this.sql, attemptAtMs);
		if (lockedForMs !== null) return accountFailure('RATE_LIMITED', rateLimitedMessage(lockedForMs), lockedForMs);
		// Count the attempt before the slow hash so parallel guesses cannot all slip past the lockout.
		recordFailedLogin(this.sql, attemptAtMs);
		if (!(await verifyPassword(parsed.data.password, account.password))) {
			return accountFailure('INVALID_CREDENTIALS', ACCOUNT_MESSAGES.invalidCredentials);
		}

		const token = createSessionToken(account.username);
		const tokenHash = await hashSessionToken(token);
		clearFailedLogins(this.sql);
		insertSession(this.sql, tokenHash, Date.now());
		return { ok: true, token, profile: this.buildProfile(this.account() ?? account) };
	}

	async logout(token: string): Promise<void> {
		if (this.account() === null || typeof token !== 'string') return;
		deleteSession(this.sql, await hashSessionToken(token));
	}

	async getProfile(token: string): Promise<AccountProfileView | null> {
		const account = await this.authenticate(token);
		return account === null ? null : this.buildProfile(account);
	}

	async updateDisplayName(token: string, displayName: string): Promise<AccountProfileResult> {
		const account = await this.authenticate(token);
		if (account === null) return accountFailure('UNAUTHORIZED', ACCOUNT_MESSAGES.unauthorized);
		const cleaned = typeof displayName === 'string' ? sanitizeDisplayName(displayName) : null;
		if (cleaned === null) return accountFailure('INVALID_INPUT', ACCOUNT_MESSAGES.invalidDisplayName);
		writeDisplayName(this.sql, cleaned);
		return { ok: true, profile: this.buildProfile({ ...account, displayName: cleaned }) };
	}

	async verifySession(token: string): Promise<VerifiedAccount | null> {
		const account = await this.authenticate(token);
		if (account === null) return null;
		return {
			accountId: account.username,
			displayName: account.displayName,
			memory: this.wordMemory(),
		};
	}

	/** Returns how many events were newly stored (exact repeats are ignored). */
	async recordWords(events: readonly WordHistoryEvent[]): Promise<number> {
		const account = this.account();
		if (account === null) return 0;
		const valid = events.slice(0, ACCOUNT_LIMITS.maxEventsPerBatch).flatMap((event) => {
			const clean = sanitizeWordEvent(event);
			return clean === null ? [] : [clean];
		});
		if (valid.length === 0) return 0;
		return this.ctx.storage.transactionSync(() => {
			const outcome = insertWordEvents(this.sql, valid);
			if (outcome.newlyDrawn > 0) {
				writeStats(this.sql, { ...account.stats, distinctWordsDrawn: account.stats.distinctWordsDrawn + outcome.newlyDrawn });
			}
			return outcome.inserted;
		});
	}

	/** Returns false when the summary is invalid or (roomCode, matchNumber) was already folded in. */
	async recordMatch(summary: MatchSummaryRecord): Promise<boolean> {
		const account = this.account();
		const valid = sanitizeMatchSummary(summary);
		if (account === null || valid === null) return false;
		return this.ctx.storage.transactionSync(() => {
			if (!insertMatch(this.sql, valid)) return false;
			writeStats(this.sql, foldMatchIntoStats(account.stats, valid));
			return true;
		});
	}

	private get sql(): SqlStorage {
		return this.ctx.storage.sql;
	}

	private account(): AccountRecord | null {
		if (!this.schemaReady) {
			this.schemaReady = accountSchemaExists(this.sql);
			if (this.schemaReady) migrateAccountSchema(this.sql);
		}
		return this.schemaReady ? readAccount(this.sql) : null;
	}

	/** What a room gets at join: the never-again list from lifetime sets, the rest from recent events. */
	private wordMemory(): PlayerWordMemory {
		return deriveWordMemory(avoidedWordIds(this.sql, WORD_MEMORY_LIMITS.avoid), wordRoleEntries(this.sql));
	}

	/** Guards against a caller routing one username's signup to another actor. */
	private isNamedFor(username: string): boolean {
		const name = this.ctx.id.name;
		return name === undefined || name === accountActorName(username);
	}

	private async authenticate(token: string): Promise<AccountRecord | null> {
		const account = this.account();
		if (account === null || typeof token !== 'string' || accountIdFromToken(token) !== account.username) return null;
		const tokenHash = await hashSessionToken(token);
		if (!touchSession(this.sql, tokenHash, Date.now())) return null;
		return this.account();
	}

	private buildProfile(account: AccountRecord): AccountProfileView {
		return {
			accountId: account.username,
			username: account.username,
			displayName: account.displayName,
			createdAtMs: account.createdAtMs,
			stats: account.stats,
			recentWords: recentWordEvents(this.sql, ACCOUNT_LIMITS.profileWordEvents),
			recentMatches: recentMatches(this.sql, ACCOUNT_LIMITS.profileMatches),
			// Exactly the words a room keeps out of this player's drafts.
			avoidedWordCount: avoidedWordIds(this.sql, WORD_MEMORY_LIMITS.avoid).length,
		};
	}
}
