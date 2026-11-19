import type { MatchSummaryRecord, PlayerWordMemory, WordHistoryEvent } from '@drawing-games/game-core';
import { accountIdFromToken, USERNAME_PATTERN } from '@drawing-games/protocol';

import type { Env } from '../env';
import { accountActor } from './actor-name';
import { ACCOUNT_LIMITS } from './limits';
import { describeError } from './log';

/**
 * In-Worker client used by the GameRoom to talk to account actors.
 * CONTRACT: failures never throw into the game loop — verify returns null,
 * record calls swallow and log. Logs never include tokens.
 */
export interface VerifiedAccount {
	readonly accountId: string;
	readonly displayName: string;
	readonly memory: PlayerWordMemory;
}

export async function verifyAccountToken(env: Env, token: string): Promise<VerifiedAccount | null> {
	const accountId = typeof token === 'string' ? accountIdFromToken(token) : null;
	if (accountId === null) return null;
	try {
		const verified = await accountActor(env, accountId).verifySession(token);
		if (verified === null || verified.accountId !== accountId) return null;
		return {
			accountId: verified.accountId,
			displayName: verified.displayName,
			memory: { avoid: [...verified.memory.avoid], soft: [...verified.memory.soft] },
		};
	} catch (error) {
		console.warn('accounts: session verification failed', describeError(error));
		return null;
	}
}

export async function recordAccountWords(env: Env, accountId: string, events: readonly WordHistoryEvent[]): Promise<void> {
	if (events.length === 0 || !USERNAME_PATTERN.test(accountId)) return;
	try {
		const actor = accountActor(env, accountId);
		for (let start = 0; start < events.length; start += ACCOUNT_LIMITS.maxEventsPerBatch) {
			await actor.recordWords(events.slice(start, start + ACCOUNT_LIMITS.maxEventsPerBatch));
		}
	} catch (error) {
		console.warn('accounts: recording word history failed', { accountId, ...describeError(error) });
	}
}

export async function recordAccountMatch(env: Env, accountId: string, summary: MatchSummaryRecord): Promise<void> {
	if (!USERNAME_PATTERN.test(accountId)) return;
	try {
		await accountActor(env, accountId).recordMatch(summary);
	} catch (error) {
		console.warn('accounts: recording match failed', { accountId, ...describeError(error) });
	}
}
