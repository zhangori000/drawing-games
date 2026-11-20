import { WORD_MEMORY_LIMITS } from '@drawing-games/game-core';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Every bound the account actor enforces, in one place. */
export const ACCOUNT_LIMITS = Object.freeze({
	/** PBKDF2-SHA-256 iterations; 100,000 is the Workers runtime maximum. */
	pbkdf2Iterations: 100_000,
	saltBytes: 16,
	derivedKeyBytes: 32,
	tokenRandomBytes: 32,

	maxSessions: 10,
	sessionIdleMs: 180 * DAY_MS,

	maxFailedLogins: 8,
	failedLoginWindowMs: 10 * MINUTE_MS,

	storedWordEvents: 1000,
	storedMatches: 50,
	/** Lifetime set of drawn word ids backing `distinctWordsDrawn` and the avoid list. */
	storedDrawnWords: 5000,
	/**
	 * Lifetime set of "seen it" word ids backing the avoid list. Rooms take at
	 * most `WORD_MEMORY_LIMITS.avoid` ids (newest first), so older reports
	 * could never be sent anyway.
	 */
	storedSeenReports: WORD_MEMORY_LIMITS.avoid,
	profileWordEvents: 200,
	profileMatches: 30,

	/** Upper bound on one `recordWords` batch; extra events are dropped. */
	maxEventsPerBatch: 500,
	maxDisplayNameLength: 24,
});
