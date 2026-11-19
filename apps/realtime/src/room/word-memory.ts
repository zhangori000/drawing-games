import { WORD_MEMORY_LIMITS, type PlayerWordMemory } from '@drawing-games/game-core';

/**
 * Builds a member's starting word memory from their quick account (if any)
 * and the word ids their browser remembers. Both inputs list the newest id
 * first; the room stores memory oldest first (newest appended last), so the
 * newest ids survive the caps.
 */
export function startingWordMemory(account: PlayerWordMemory | null, recentWordIds: readonly string[]): PlayerWordMemory {
	return {
		avoid: newestFirstToStored(account?.avoid ?? [], WORD_MEMORY_LIMITS.avoid),
		soft: newestFirstToStored([...recentWordIds, ...(account?.soft ?? [])], WORD_MEMORY_LIMITS.soft),
	};
}

function newestFirstToStored(ids: readonly string[], limit: number): string[] {
	return [...new Set(ids)].slice(0, limit).reverse();
}
