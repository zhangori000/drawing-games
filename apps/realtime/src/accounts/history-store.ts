import { WORD_HISTORY_ROLES, type MatchSummaryRecord, type WordHistoryEvent, type WordHistoryRole } from '@drawing-games/game-core';

import { ACCOUNT_LIMITS } from './limits';
import type { WordRoleEntry } from './stats';
import { sanitizeMatchSummary, sanitizeWordEvent } from './validate';

/** Word events, the lifetime drawn-word set, and match summaries (all bounded). */

export interface WordInsertOutcome {
	readonly inserted: number;
	/** Drawn word ids this account had never drawn before. */
	readonly newlyDrawn: number;
}

/** Inserts events, ignoring exact (wordId, role, roomCode, atMs) repeats. */
export function insertWordEvents(sql: SqlStorage, events: readonly WordHistoryEvent[]): WordInsertOutcome {
	let inserted = 0;
	let newlyDrawn = 0;
	for (const event of events) {
		const rows = sql
			.exec(
				`INSERT INTO word_events (word_id, role, room_code, at_ms, event_json) VALUES (?, ?, ?, ?, ?)
				ON CONFLICT DO NOTHING RETURNING id`,
				event.wordId,
				event.role,
				event.roomCode,
				event.atMs,
				JSON.stringify(event),
			)
			.toArray();
		if (rows.length === 0) continue;
		inserted += 1;
		if (event.role === 'drew' && markDrawn(sql, event.wordId, event.atMs)) newlyDrawn += 1;
	}
	if (inserted > 0) trimWordHistory(sql);
	return { inserted, newlyDrawn };
}

/** Returns true when the word was not yet in the drawn set. */
function markDrawn(sql: SqlStorage, wordId: string, atMs: number): boolean {
	const known = sql.exec(`SELECT 1 FROM drawn_words WHERE word_id = ?`, wordId).toArray().length > 0;
	sql.exec(
		`INSERT INTO drawn_words (word_id, last_drawn_at_ms) VALUES (?, ?)
		ON CONFLICT (word_id) DO UPDATE SET last_drawn_at_ms = max(last_drawn_at_ms, excluded.last_drawn_at_ms)`,
		wordId,
		atMs,
	);
	return !known;
}

function trimWordHistory(sql: SqlStorage): void {
	sql.exec(
		`DELETE FROM word_events WHERE id IN (SELECT id FROM word_events ORDER BY at_ms DESC, id DESC LIMIT -1 OFFSET ?)`,
		ACCOUNT_LIMITS.storedWordEvents,
	);
	sql.exec(
		`DELETE FROM drawn_words WHERE word_id IN (
			SELECT word_id FROM drawn_words ORDER BY last_drawn_at_ms DESC LIMIT -1 OFFSET ?
		)`,
		ACCOUNT_LIMITS.storedDrawnWords,
	);
}

export function recentWordEvents(sql: SqlStorage, limit: number): WordHistoryEvent[] {
	const rows = sql.exec<{ event_json: string }>(`SELECT event_json FROM word_events ORDER BY at_ms DESC, id DESC LIMIT ?`, limit).toArray();
	return rows.flatMap((row) => {
		const event = sanitizeWordEvent(parseJson(row.event_json));
		return event === null ? [] : [event];
	});
}

/** Every stored (wordId, role) pair, newest first, for memory derivation. */
export function wordRoleEntries(sql: SqlStorage): WordRoleEntry[] {
	const rows = sql.exec<{ word_id: string; role: string }>(`SELECT word_id, role FROM word_events ORDER BY at_ms DESC, id DESC`).toArray();
	return rows.flatMap(({ word_id: wordId, role }) => (isWordHistoryRole(role) ? [{ wordId, role }] : []));
}

function isWordHistoryRole(value: string): value is WordHistoryRole {
	return WORD_HISTORY_ROLES.some((role) => role === value);
}

/** Inserts a match summary; false when (roomCode, matchNumber) was already recorded. */
export function insertMatch(sql: SqlStorage, summary: MatchSummaryRecord): boolean {
	const rows = sql
		.exec(
			`INSERT INTO matches (room_code, match_number, ended_at_ms, summary_json) VALUES (?, ?, ?, ?)
			ON CONFLICT DO NOTHING RETURNING match_number`,
			summary.roomCode,
			summary.matchNumber,
			summary.endedAtMs,
			JSON.stringify(summary),
		)
		.toArray();
	if (rows.length === 0) return false;
	sql.exec(
		`DELETE FROM matches WHERE rowid IN (SELECT rowid FROM matches ORDER BY ended_at_ms DESC, rowid DESC LIMIT -1 OFFSET ?)`,
		ACCOUNT_LIMITS.storedMatches,
	);
	return true;
}

export function recentMatches(sql: SqlStorage, limit: number): MatchSummaryRecord[] {
	const rows = sql
		.exec<{ summary_json: string }>(`SELECT summary_json FROM matches ORDER BY ended_at_ms DESC, rowid DESC LIMIT ?`, limit)
		.toArray();
	return rows.flatMap((row) => {
		const summary = sanitizeMatchSummary(parseJson(row.summary_json));
		return summary === null ? [] : [summary];
	});
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}
