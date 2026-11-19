/**
 * SQLite schema for one room. Tables are created only by `create()`, so
 * probing a code that was never created leaves the actor's storage empty.
 */
const SCHEMA_STATEMENTS: readonly string[] = [
	`CREATE TABLE IF NOT EXISTS kv (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	)`,
	// SECURITY: SHA-256 hashes of resume tokens only, never the tokens.
	`CREATE TABLE IF NOT EXISTS sessions (
		token_hash TEXT PRIMARY KEY,
		member_id TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS sessions_by_member ON sessions (member_id)`,
	`CREATE TABLE IF NOT EXISTS canvases (
		canvas_id TEXT PRIMARY KEY,
		team TEXT NOT NULL,
		document TEXT NOT NULL,
		updated_at INTEGER NOT NULL
	)`,
	// Insertion order (rowid) decides which ids are the newest to keep.
	`CREATE TABLE IF NOT EXISTS commands (
		command_id TEXT PRIMARY KEY,
		member_id TEXT NOT NULL,
		signature TEXT NOT NULL,
		ack TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)`,
];

export function roomSchemaExists(sql: SqlStorage): boolean {
	return sql.exec(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'kv'`).toArray().length > 0;
}

export function createRoomSchema(sql: SqlStorage): void {
	for (const statement of SCHEMA_STATEMENTS) sql.exec(statement);
}
