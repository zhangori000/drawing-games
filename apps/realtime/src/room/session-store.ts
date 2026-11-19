/**
 * Resume-token hash → member id. SECURITY: callers pass SHA-256 hashes;
 * the tokens themselves are never stored or logged.
 */
export function insertSession(sql: SqlStorage, tokenHash: string, memberId: string, nowMs: number): void {
	sql.exec(
		`INSERT INTO sessions (token_hash, member_id, created_at) VALUES (?, ?, ?)
		 ON CONFLICT (token_hash) DO UPDATE SET member_id = excluded.member_id`,
		tokenHash,
		memberId,
		nowMs,
	);
}

export function findSessionMember(sql: SqlStorage, tokenHash: string): string | null {
	const rows = sql.exec<{ member_id: string }>(`SELECT member_id FROM sessions WHERE token_hash = ?`, tokenHash).toArray();
	return rows[0]?.member_id ?? null;
}

export function deleteMemberSessions(sql: SqlStorage, memberIds: readonly string[]): void {
	for (const memberId of memberIds) sql.exec(`DELETE FROM sessions WHERE member_id = ?`, memberId);
}
