import { ACCOUNT_LIMITS } from './limits';

/** Session rows (keyed by SHA-256 token hash) and failed-login timestamps. */

export function insertSession(sql: SqlStorage, tokenHash: string, nowMs: number): void {
	deleteExpiredSessions(sql, nowMs);
	sql.exec(`INSERT INTO sessions (token_hash, created_at_ms, last_used_at_ms) VALUES (?, ?, ?)`, tokenHash, nowMs, nowMs);
	// Evict least recently used sessions beyond the cap (rowid breaks ties so the new one stays).
	sql.exec(
		`DELETE FROM sessions WHERE token_hash IN (
			SELECT token_hash FROM sessions ORDER BY last_used_at_ms DESC, rowid DESC LIMIT -1 OFFSET ?
		)`,
		ACCOUNT_LIMITS.maxSessions,
	);
}

/** Returns whether the session is live, refreshing its idle timer if so. */
export function touchSession(sql: SqlStorage, tokenHash: string, nowMs: number): boolean {
	const [row] = sql.exec<{ last_used_at_ms: number }>(`SELECT last_used_at_ms FROM sessions WHERE token_hash = ?`, tokenHash).toArray();
	if (row === undefined) return false;
	if (nowMs - row.last_used_at_ms > ACCOUNT_LIMITS.sessionIdleMs) {
		deleteSession(sql, tokenHash);
		return false;
	}
	sql.exec(`UPDATE sessions SET last_used_at_ms = ? WHERE token_hash = ?`, Math.max(nowMs, row.last_used_at_ms), tokenHash);
	return true;
}

export function deleteSession(sql: SqlStorage, tokenHash: string): void {
	sql.exec(`DELETE FROM sessions WHERE token_hash = ?`, tokenHash);
}

function deleteExpiredSessions(sql: SqlStorage, nowMs: number): void {
	sql.exec(`DELETE FROM sessions WHERE last_used_at_ms < ?`, nowMs - ACCOUNT_LIMITS.sessionIdleMs);
}

/**
 * Milliseconds until login is allowed again, or null when not locked out.
 * Locked while `maxFailedLogins` failures sit inside the sliding window; the
 * lock lifts when the oldest of those leaves it.
 */
export function lockoutRemainingMs(sql: SqlStorage, nowMs: number): number | null {
	const windowStart = nowMs - ACCOUNT_LIMITS.failedLoginWindowMs;
	sql.exec(`DELETE FROM failed_logins WHERE at_ms <= ?`, windowStart);
	const [row] = sql
		.exec<{ at_ms: number }>(
			`SELECT at_ms FROM failed_logins ORDER BY at_ms DESC, id DESC LIMIT 1 OFFSET ?`,
			ACCOUNT_LIMITS.maxFailedLogins - 1,
		)
		.toArray();
	if (row === undefined) return null;
	return Math.max(1, row.at_ms + ACCOUNT_LIMITS.failedLoginWindowMs - nowMs);
}

export function recordFailedLogin(sql: SqlStorage, nowMs: number): void {
	sql.exec(`INSERT INTO failed_logins (at_ms) VALUES (?)`, nowMs);
}

export function clearFailedLogins(sql: SqlStorage): void {
	sql.exec(`DELETE FROM failed_logins`);
}
