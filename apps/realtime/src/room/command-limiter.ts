import { KeyedRateLimiter, TokenBucket, type TokenBucketPolicy } from '../rate-limit';
import { COMMAND_RATE_LIMITS } from './constants';

export type CommandLane = keyof typeof COMMAND_RATE_LIMITS;

type LanePolicies = Readonly<Record<CommandLane, TokenBucketPolicy>>;

/** Members are few per room; the bound only guards against a runaway map. */
const MAX_TRACKED_MEMBERS = 256;

/**
 * Command budgets (`COMMAND_RATE_LIMITS`). A bound socket spends its
 * member's budget, so reconnecting never refills it; a socket that has not
 * joined yet has its own. Memory only: after the room wakes from hibernation
 * every budget starts full, as an idle room's budgets would be anyway.
 */
export class CommandLimiter {
	private readonly members: Readonly<Record<CommandLane, KeyedRateLimiter>>;
	private readonly sockets = new WeakMap<WebSocket, Record<CommandLane, TokenBucket>>();

	constructor(private readonly policies: LanePolicies = COMMAND_RATE_LIMITS) {
		this.members = {
			control: new KeyedRateLimiter(policies.control, MAX_TRACKED_MEMBERS),
			drawing: new KeyedRateLimiter(policies.drawing, MAX_TRACKED_MEMBERS),
		};
	}

	/** Spends one command from `lane`: 0 when allowed, else the ms until retry. */
	take(ws: WebSocket, memberId: string | null, lane: CommandLane, nowMs: number): number {
		if (memberId !== null) return this.members[lane].take(memberId, nowMs);
		let buckets = this.sockets.get(ws);
		if (buckets === undefined) {
			buckets = { control: new TokenBucket(this.policies.control, nowMs), drawing: new TokenBucket(this.policies.drawing, nowMs) };
			this.sockets.set(ws, buckets);
		}
		return buckets[lane].take(nowMs);
	}

	/** Drops a removed member's budgets. */
	forgetMember(memberId: string): void {
		this.members.control.forget(memberId);
		this.members.drawing.forget(memberId);
	}
}

/** The lane of a decoded (not yet validated) client message. */
export function commandLane(raw: unknown): CommandLane {
	if (typeof raw !== 'object' || raw === null || !('command' in raw)) return 'control';
	const command: unknown = raw.command;
	return typeof command === 'object' && command !== null && 'type' in command && command.type === 'drawing.batch' ? 'drawing' : 'control';
}
