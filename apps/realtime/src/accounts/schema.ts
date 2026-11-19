/**
 * SQLite schema for one account actor. Tables are created only by a
 * successful signup, so a login or verify against a username that was never
 * registered leaves the actor's storage empty.
 */
const SCHEMA_STATEMENTS: readonly string[] = [
	`CREATE TABLE IF NOT EXISTS account (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		username TEXT NOT NULL,
		display_name TEXT NOT NULL,
		password_hash TEXT NOT NULL,
		password_salt TEXT NOT NULL,
		password_iterations INTEGER NOT NULL,
		created_at_ms INTEGER NOT NULL,
		stats_json TEXT NOT NULL
	)`,
	// Only SHA-256 hashes of session tokens are stored.
	`CREATE TABLE IF NOT EXISTS sessions (
		token_hash TEXT PRIMARY KEY,
		created_at_ms INTEGER NOT NULL,
		last_used_at_ms INTEGER NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS failed_logins (
		id INTEGER PRIMARY KEY,
		at_ms INTEGER NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS word_events (
		id INTEGER PRIMARY KEY,
		word_id TEXT NOT NULL,
		role TEXT NOT NULL,
		room_code TEXT NOT NULL,
		at_ms INTEGER NOT NULL,
		event_json TEXT NOT NULL,
		UNIQUE (word_id, role, room_code, at_ms)
	)`,
	`CREATE INDEX IF NOT EXISTS word_events_newest ON word_events (at_ms DESC, id DESC)`,
	`CREATE TABLE IF NOT EXISTS drawn_words (
		word_id TEXT PRIMARY KEY,
		last_drawn_at_ms INTEGER NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS matches (
		room_code TEXT NOT NULL,
		match_number INTEGER NOT NULL,
		ended_at_ms INTEGER NOT NULL,
		summary_json TEXT NOT NULL,
		PRIMARY KEY (room_code, match_number)
	)`,
];

export function accountSchemaExists(sql: SqlStorage): boolean {
	return sql.exec(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'account'`).toArray().length > 0;
}

export function createAccountSchema(sql: SqlStorage): void {
	for (const statement of SCHEMA_STATEMENTS) sql.exec(statement);
}
