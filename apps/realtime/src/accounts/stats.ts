import {
	EMPTY_ACCOUNT_STATS,
	WORD_MEMORY_LIMITS,
	type AccountStats,
	type MatchSummaryRecord,
	type PlayerWordMemory,
	type WordHistoryRole,
} from '@drawing-games/game-core';

/** Pure folds over account history; storage lives in the *-store modules. */

function minNullable(a: number | null, b: number | null): number | null {
	if (a === null) return b;
	if (b === null) return a;
	return Math.min(a, b);
}

export function foldMatchIntoStats(stats: AccountStats, summary: MatchSummaryRecord): AccountStats {
	const match = summary.stats;
	return {
		matchesPlayed: stats.matchesPlayed + 1,
		wins: stats.wins + (summary.result === 'win' ? 1 : 0),
		losses: stats.losses + (summary.result === 'loss' ? 1 : 0),
		ties: stats.ties + (summary.result === 'tie' ? 1 : 0),
		roundsDrawn: stats.roundsDrawn + match.roundsDrawn,
		drawingsSolved: stats.drawingsSolved + match.drawingsSolved,
		drawerSolveMsTotal: stats.drawerSolveMsTotal + match.drawerSolveMsTotal,
		guessesSubmitted: stats.guessesSubmitted + match.guessesSubmitted,
		correctGuesses: stats.correctGuesses + match.correctGuesses,
		closeGuesses: stats.closeGuesses + match.closeGuesses,
		timeToCorrectMsTotal: stats.timeToCorrectMsTotal + match.timeToCorrectMsTotal,
		fastestCorrectMs: minNullable(stats.fastestCorrectMs, match.fastestCorrectMs),
		hardWordsSolved: stats.hardWordsSolved + match.hardWordsSolved,
		pointsWon: stats.pointsWon + match.pointsWon,
		showdownCardsDrawn: stats.showdownCardsDrawn + match.showdownCardsDrawn,
		showdownCardsGuessed: stats.showdownCardsGuessed + match.showdownCardsGuessed,
		distinctWordsDrawn: stats.distinctWordsDrawn,
	};
}

/**
 * Reads persisted stats, defaulting any missing or corrupt field so stats
 * added to `AccountStats` later start from zero for existing accounts.
 */
export function parseStoredStats(json: string): AccountStats {
	let stored: unknown;
	try {
		stored = JSON.parse(json);
	} catch {
		return EMPTY_ACCOUNT_STATS;
	}
	if (typeof stored !== 'object' || stored === null) return EMPTY_ACCOUNT_STATS;
	const merged: Record<string, number | null> = { ...EMPTY_ACCOUNT_STATS };
	for (const key of Object.keys(EMPTY_ACCOUNT_STATS)) {
		const value: unknown = Reflect.get(stored, key);
		if (typeof value === 'number' && Number.isFinite(value)) merged[key] = value;
	}
	// Every AccountStats key was copied from EMPTY_ACCOUNT_STATS above.
	return merged as unknown as AccountStats;
}

const AVOID_ROLES: ReadonlySet<WordHistoryRole> = new Set<WordHistoryRole>(['drew', 'seen-report']);

export interface WordRoleEntry {
	readonly wordId: string;
	readonly role: WordHistoryRole;
}

/**
 * `avoid` = words the player drew or reported as seen (never offer to them
 * as drawer again); `soft` = everything else they met. Both are
 * de-duplicated, keep the input order (pass newest first), and are capped.
 */
export function deriveWordMemory(newestFirst: readonly WordRoleEntry[]): PlayerWordMemory {
	const avoid = new Set<string>();
	const soft = new Set<string>();
	for (const { wordId, role } of newestFirst) {
		if (AVOID_ROLES.has(role)) {
			if (avoid.size < WORD_MEMORY_LIMITS.avoid) avoid.add(wordId);
		} else if (soft.size < WORD_MEMORY_LIMITS.soft) {
			soft.add(wordId);
		}
	}
	return { avoid: [...avoid], soft: [...soft] };
}
