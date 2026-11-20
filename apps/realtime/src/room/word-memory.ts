import { WORD_MEMORY_LIMITS, type PlayerWordMemory } from '@drawing-games/game-core';

/** What a guest browser remembers, newest first (see `room.join`). */
export interface DeviceWordHistory {
	/** Words it drew or reported as "seen it". */
	readonly avoid?: readonly string[];
	/** Every other word it met. */
	readonly soft?: readonly string[];
}

/**
 * Builds a member's starting word memory from their quick account (if any)
 * and the word ids their browser remembers. A browser's drawn and "seen it"
 * words join the account's `avoid` list (never dealt again to this drawer
 * while fresh words remain), the rest join `soft`. All inputs list the
 * newest id first; the room stores memory oldest first (newest appended
 * last), so the newest ids survive the caps.
 */
export function startingWordMemory(account: PlayerWordMemory | null, device: DeviceWordHistory = {}): PlayerWordMemory {
	return {
		avoid: newestFirstToStored([...(device.avoid ?? []), ...(account?.avoid ?? [])], WORD_MEMORY_LIMITS.avoid),
		soft: newestFirstToStored([...(device.soft ?? []), ...(account?.soft ?? [])], WORD_MEMORY_LIMITS.soft),
	};
}

function newestFirstToStored(ids: readonly string[], limit: number): string[] {
	return [...new Set(ids)].slice(0, limit).reverse();
}
