/**
 * Limits and timings owned by the room server. Game rules (phases,
 * deadlines, scoring) live in `@drawing-games/game-core`.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;
/** Random codes tried before POST /rooms gives up (collisions are rare). */
export const ROOM_CREATE_ATTEMPTS = 8;

/** Largest accepted client message, in UTF-8 bytes. */
export const MAX_MESSAGE_BYTES = 64 * 1024;
/** Newest command ids remembered for de-duplication. */
export const COMMAND_LOG_LIMIT = 1000;

export const CANVAS_LIMITS = Object.freeze({ maxStrokes: 400, maxPoints: 20_000 });
/** Matches `canvasOpsPayloadSchema` (ops per `canvas.ops` event). */
export const MAX_OPS_PER_EVENT = 256;
/** Opponent previews go out at most this often per canvas. */
export const PREVIEW_INTERVAL_MS = 800;

/** A room with no sockets is deleted after this long without activity. */
export const IDLE_ROOM_TTL_MS = 6 * 60 * 60 * 1000;

export const CLOSE_CODES = Object.freeze({
	/** Another socket took over this member; clients must not auto-reconnect. */
	replaced: 4001,
	/** The member was removed from the room or left it. */
	removed: 4003,
	notFound: 4404,
	tooLarge: 1009,
	internal: 1011,
});
