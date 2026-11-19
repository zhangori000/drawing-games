import type { CommandEnvelopeV1 } from '@drawing-games/protocol';

import { COMMAND_LOG_LIMIT } from './constants';
import { sha256Hex } from './secrets';

/**
 * Accepted command ids, so a retried command (same commandId) is answered
 * with its original ack instead of being applied twice. Undo, redo, clear,
 * and guesses are not idempotent, so drawing batches are logged too.
 */
export interface CommandRecord {
	readonly commandId: string;
	/** The member who sent it (for a join, the member it created). */
	readonly memberId: string;
	readonly signature: string;
	readonly clientSeq: number;
	/** Room sequence the original ack carried. */
	readonly roomSeq: number;
}

interface StoredAck {
	readonly clientSeq: number;
	readonly roomSeq: number;
}

/**
 * SHA-256 of the retry-stable parts of an envelope. Hashing keeps account
 * tokens and drawing payloads out of the table. Zod returns commands in
 * schema key order, so the JSON is deterministic.
 */
export function commandSignature(envelope: CommandEnvelopeV1): Promise<string> {
	return sha256Hex(JSON.stringify({ clientSeq: envelope.clientSeq, command: envelope.command }));
}

export class CommandLog {
	/** Row count, loaded lazily (null after a reload). */
	private count: number | null = null;

	constructor(
		private readonly sql: SqlStorage,
		private readonly limit: number = COMMAND_LOG_LIMIT,
	) {}

	find(commandId: string): CommandRecord | null {
		const row = this.sql
			.exec<{ member_id: string; signature: string; ack: string }>(
				`SELECT member_id, signature, ack FROM commands WHERE command_id = ?`,
				commandId,
			)
			.toArray()[0];
		if (row === undefined) return null;
		const ack = JSON.parse(row.ack) as StoredAck;
		return { commandId, memberId: row.member_id, signature: row.signature, clientSeq: ack.clientSeq, roomSeq: ack.roomSeq };
	}

	/** Call inside the commit transaction. Keeps only the newest `limit` rows. */
	insert(record: CommandRecord, nowMs: number): void {
		const ack: StoredAck = { clientSeq: record.clientSeq, roomSeq: record.roomSeq };
		this.sql.exec(
			`INSERT INTO commands (command_id, member_id, signature, ack, created_at) VALUES (?, ?, ?, ?, ?)`,
			record.commandId,
			record.memberId,
			record.signature,
			JSON.stringify(ack),
			nowMs,
		);
		const count = this.count === null ? this.countRows() : this.count + 1;
		const excess = count - this.limit;
		if (excess > 0) {
			this.sql.exec(`DELETE FROM commands WHERE rowid IN (SELECT rowid FROM commands ORDER BY rowid ASC LIMIT ?)`, excess);
		}
		this.count = Math.min(count, this.limit);
	}

	/** Forget cached counters (after a failed transaction or storage reset). */
	reset(): void {
		this.count = null;
	}

	private countRows(): number {
		return this.sql.exec<{ total: number }>(`SELECT COUNT(*) AS total FROM commands`).one().total;
	}
}
