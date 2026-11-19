import type { AccountStats } from '@drawing-games/game-core';

import type { StoredPassword } from './crypto';
import { parseStoredStats } from './stats';

/** The single account row. Callers must check `accountSchemaExists` first. */
export interface AccountRecord {
	readonly username: string;
	readonly displayName: string;
	readonly password: StoredPassword;
	readonly createdAtMs: number;
	readonly stats: AccountStats;
}

type AccountRow = {
	username: string;
	display_name: string;
	password_hash: string;
	password_salt: string;
	password_iterations: number;
	created_at_ms: number;
	stats_json: string;
};

export function readAccount(sql: SqlStorage): AccountRecord | null {
	const [row] = sql
		.exec<AccountRow>(
			`SELECT username, display_name, password_hash, password_salt, password_iterations, created_at_ms, stats_json
			FROM account WHERE id = 1`,
		)
		.toArray();
	if (row === undefined) return null;
	return {
		username: row.username,
		displayName: row.display_name,
		password: { hash: row.password_hash, salt: row.password_salt, iterations: row.password_iterations },
		createdAtMs: row.created_at_ms,
		stats: parseStoredStats(row.stats_json),
	};
}

export function insertAccount(sql: SqlStorage, account: AccountRecord): void {
	sql.exec(
		`INSERT INTO account (id, username, display_name, password_hash, password_salt, password_iterations, created_at_ms, stats_json)
		VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
		account.username,
		account.displayName,
		account.password.hash,
		account.password.salt,
		account.password.iterations,
		account.createdAtMs,
		JSON.stringify(account.stats),
	);
}

export function writeDisplayName(sql: SqlStorage, displayName: string): void {
	sql.exec(`UPDATE account SET display_name = ? WHERE id = 1`, displayName);
}

export function writeStats(sql: SqlStorage, stats: AccountStats): void {
	sql.exec(`UPDATE account SET stats_json = ? WHERE id = 1`, JSON.stringify(stats));
}
