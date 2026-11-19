import type { MatchSummaryRecord, PlayerWordMemory, WordHistoryEvent } from '@drawing-games/game-core';

import type { Env } from '../env';

/**
 * In-Worker client used by the GameRoom to talk to account actors.
 * CONTRACT: implemented by the accounts module. Failures must never throw
 * into the game loop — verify returns null, record calls swallow and log.
 */
export interface VerifiedAccount {
	readonly accountId: string;
	readonly displayName: string;
	readonly memory: PlayerWordMemory;
}

export async function verifyAccountToken(_env: Env, _token: string): Promise<VerifiedAccount | null> {
	return null;
}

export async function recordAccountWords(_env: Env, _accountId: string, _events: readonly WordHistoryEvent[]): Promise<void> {}

export async function recordAccountMatch(_env: Env, _accountId: string, _summary: MatchSummaryRecord): Promise<void> {}
