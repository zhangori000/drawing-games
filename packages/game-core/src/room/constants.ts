import type { StrokeStyle } from '@drawing-games/drawing-model'

/** A disconnected member keeps their drawer turn and vote for this long. */
export const RECONNECT_GRACE_MS = 10_000
/** A disconnected host hands over to a connected human after this long. */
export const HOST_TRANSFER_MS = 15_000

export const MAX_DISPLAY_NAME_LENGTH = 24
export const FALLBACK_DISPLAY_NAME = 'Player'

export const GUESS_MAX_LENGTH = 60
export const GUESS_MIN_INTERVAL_MS = 400
export const MAX_GUESSES_PER_ROUND = 50
export const GUESS_FEED_LIMIT = 60

export const MAX_OPS_PER_BATCH = 64
/** Matches the wire protocol's per-append point limit. */
export const MAX_POINTS_PER_APPEND = 128

export const USED_WORDS_CAP = 1000
export const RECENT_PACKS_CAP = 8

export const BOT_NAMES: readonly string[] = Object.freeze([
  'Pixel Pete',
  'Doodlebot',
  'Sketchy',
  'Inkling',
  'Scribbles',
  'Smudge',
  'Squiggles',
  'Blotto',
])

export const BOT_STROKE_STYLE: StrokeStyle = Object.freeze({
  color: '#181713',
  width: 0.012,
  opacity: 1,
})

/** Surrender rule constants (contract: ≥3 completed rounds, ≥100 behind). */
export const SURRENDER_RULES = Object.freeze({
  enabled: true,
  minimumCompletedRounds: 3,
  minimumPointDeficit: 100,
})

/** Showdown cards have no per-card deadline; bots pace guesses on this. */
export const SHOWDOWN_BOT_CARD_BUDGET_MS = 30_000
