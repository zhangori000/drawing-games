import {
	cleanDisplayName,
	EMPTY_MEMBER_MATCH_STATS,
	TEAM_IDS,
	WORD_DIFFICULTIES,
	WORD_HISTORY_ROLES,
	type MatchSummaryRecord,
	type MemberMatchStats,
	type WordHistoryEvent,
} from '@drawing-games/game-core';

import { ACCOUNT_LIMITS } from './limits';

/**
 * Defensive copies of room-sourced records. The GameRoom is trusted, but RPC
 * arguments cross a serialization boundary, so the actor only persists
 * records whose shape it recognises and strips any extra fields.
 */
type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, maxLength: number): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
	return options.some((option) => option === value);
}

function nullableNumber(value: unknown): number | null | undefined {
	if (value === null) return null;
	return isFiniteNumber(value) ? value : undefined;
}

export function sanitizeWordEvent(value: unknown): WordHistoryEvent | null {
	if (!isRecord(value)) return null;
	const { wordId, term, packId, difficulty, role, solved, atMs, roomCode } = value;
	const solveMs = nullableNumber(value.solveMs);
	const points = nullableNumber(value.points);
	if (
		!isText(wordId, 128) ||
		!isText(term, 128) ||
		!isText(packId, 64) ||
		!isOneOf(WORD_DIFFICULTIES, difficulty) ||
		!isOneOf(WORD_HISTORY_ROLES, role) ||
		!(solved === null || typeof solved === 'boolean') ||
		solveMs === undefined ||
		points === undefined ||
		!isFiniteNumber(atMs) ||
		!isText(roomCode, 32)
	) {
		return null;
	}
	return { wordId, term, packId, difficulty, role, solved, solveMs, points, atMs, roomCode };
}

function sanitizeMemberStats(value: unknown): MemberMatchStats | null {
	if (!isRecord(value)) return null;
	const stats: Record<string, number | null> = {};
	for (const key of Object.keys(EMPTY_MEMBER_MATCH_STATS)) {
		const raw = value[key];
		if (key === 'fastestCorrectMs') {
			if (!(raw === null || isCount(raw))) return null;
		} else if (!isCount(raw)) {
			return null;
		}
		stats[key] = raw;
	}
	// Every key of MemberMatchStats was checked above.
	return stats as unknown as MemberMatchStats;
}

export function sanitizeMatchSummary(value: unknown): MatchSummaryRecord | null {
	if (!isRecord(value)) return null;
	const { roomCode, matchNumber, endedAtMs, team, result, teamScore, opponentScore, endedReason, withBots, roundsPlayed } = value;
	const stats = sanitizeMemberStats(value.stats);
	if (
		!isText(roomCode, 32) ||
		!isCount(matchNumber) ||
		!isFiniteNumber(endedAtMs) ||
		!isOneOf(TEAM_IDS, team) ||
		!isOneOf(['win', 'loss', 'tie'] as const, result) ||
		!isFiniteNumber(teamScore) ||
		!isFiniteNumber(opponentScore) ||
		!isOneOf(['completed', 'surrender'] as const, endedReason) ||
		typeof withBots !== 'boolean' ||
		!isCount(roundsPlayed) ||
		stats === null
	) {
		return null;
	}
	return { roomCode, matchNumber, endedAtMs, team, result, teamScore, opponentScore, endedReason, withBots, roundsPlayed, stats };
}

/**
 * Turns control characters into spaces, then cleans like a room member name
 * (`cleanDisplayName`: zero-width, bidi and other invisible format
 * characters stripped, whitespace collapsed, length capped). Returns null
 * when nothing visible is left, so a name cannot be blank on /me or in a
 * room.
 */
export function sanitizeDisplayName(value: string): string | null {
	return cleanDisplayName(value.replace(/\p{Cc}/gu, ' '), ACCOUNT_LIMITS.maxDisplayNameLength);
}
