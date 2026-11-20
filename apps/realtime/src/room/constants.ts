import { MAX_COMMAND_MESSAGE_BYTES } from '@drawing-games/protocol';

/**
 * Limits and timings owned by the room server. Game rules (phases,
 * deadlines, scoring) live in `@drawing-games/game-core`.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;
/** Random codes tried before POST /rooms gives up (collisions are rare). */
export const ROOM_CREATE_ATTEMPTS = 8;

/** Largest accepted client message, in UTF-8 bytes (shared with clients). */
export const MAX_MESSAGE_BYTES = MAX_COMMAND_MESSAGE_BYTES;
/** Newest command ids remembered for de-duplication. */
export const COMMAND_LOG_LIMIT = 1000;

export const CANVAS_LIMITS = Object.freeze({ maxStrokes: 400, maxPoints: 20_000 });
/** Matches `canvasOpsPayloadSchema` (ops per `canvas.ops` event). */
export const MAX_OPS_PER_EVENT = 256;
/** Opponent previews go out at most this often per canvas. */
export const PREVIEW_INTERVAL_MS = 800;

/** A room with no member sockets is deleted after this long without activity. */
export const IDLE_ROOM_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * A socket that is not bound to a member (it never sent a successful
 * `room.join`/`room.resume`, or its member left) is closed this long after
 * it connected or was unbound. Clients reconnect on their own, so a tab
 * waiting on the join form just reopens its socket.
 */
export const HANDSHAKE_TIMEOUT_MS = 30_000;

/**
 * Commands each member (or each socket, before it joins) may send, in two
 * lanes. Over the limit a command is refused with a retryable
 * `RATE_LIMITED` error (`details.retryAfterMs`) and is not applied, so it
 * may be resent unchanged. Resends of already applied commands are free.
 * - control: everything but drawing. People click a few times a second at
 *   most and guesses are paced client-side (~2/s), so 20 back to back, then
 *   5/s, is only ever met by scripts.
 * - drawing: `drawing.batch`. The web client flushes at most every 50 ms
 *   (20/s; a fast scribbler measured ~15/s) and, after a reconnect, sends
 *   its whole backlog at once, so the burst covers ~12 s of non-stop
 *   drawing while a flood is held to 30 batches a second.
 */
export const COMMAND_RATE_LIMITS = Object.freeze({
	control: { capacity: 20, refillPerSecond: 5 },
	drawing: { capacity: 240, refillPerSecond: 30 },
});

export const CLOSE_CODES = Object.freeze({
	/** Another socket took over this member; clients must not auto-reconnect. */
	replaced: 4001,
	/** The member was removed from the room or left it. */
	removed: 4003,
	/** Not joined within `HANDSHAKE_TIMEOUT_MS`; clients may reconnect. */
	handshakeTimeout: 4008,
	notFound: 4404,
	tooLarge: 1009,
	internal: 1011,
});
