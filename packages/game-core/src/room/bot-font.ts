import type { NormalizedPoint } from '@drawing-games/drawing-model'

/** One pen-down polyline in normalized canvas coordinates (0..1). */
export type BotStroke = readonly NormalizedPoint[]

/**
 * CONTRACT STUB. Lays out `text` (uppercased A–Z, 0–9, space, hyphen,
 * apostrophe) as single-stroke glyph polylines that fit inside the 4:3
 * canvas with margins, wrapping long phrases onto multiple lines. Used by
 * practice bots so a human can test guessing alone.
 */
export function renderTextStrokes(_text: string): BotStroke[] {
  return []
}
