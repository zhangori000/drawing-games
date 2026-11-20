import { FALLBACK_DISPLAY_NAME, MAX_DISPLAY_NAME_LENGTH } from './constants'

/**
 * Characters that are never shown: C0/C1 controls, format characters (zero
 * width spaces and joiners, bidi embeddings, overrides and isolates, soft
 * hyphens, word joiners, tags, the BOM), and line/paragraph separators.
 */
const INVISIBLE_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu

/**
 * Characters that draw nothing on their own: whitespace, combining marks
 * (accents, variation selectors), and the blank filler letters (Hangul
 * fillers, braille blank) that look like empty space.
 */
const BLANK_CHARACTERS = /[\s\p{M}\u115f\u1160\u3164\uffa0\u2800]/gu

/** Strips control/invisible characters, collapses whitespace, and trims. */
export function cleanText(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Length in code points, so emoji count as one character. */
export function codePointLength(text: string): number {
  return Array.from(text).length
}

function truncateCodePoints(text: string, max: number): string {
  const points = Array.from(text)
  return points.length <= max ? text : points.slice(0, max).join('').trimEnd()
}

/** Whether `text` has at least one character that draws something. */
export function hasVisibleCharacter(text: string): boolean {
  return text.replace(BLANK_CHARACTERS, '').length > 0
}

/**
 * A display name cleaned like any room text and capped at `maxLength` code
 * points, or null when nothing visible is left (only whitespace, invisible
 * format characters, marks, or blank fillers). Rooms and accounts share it.
 */
export function cleanDisplayName(
  raw: unknown,
  maxLength: number = MAX_DISPLAY_NAME_LENGTH,
): string | null {
  const cleaned = typeof raw === 'string' ? cleanText(raw) : ''
  const name = truncateCodePoints(cleaned, maxLength)
  return hasVisibleCharacter(name) ? name : null
}

/** A room member name: `cleanDisplayName`, else "Player". */
export function sanitizeDisplayName(raw: unknown): string {
  return cleanDisplayName(raw) ?? FALLBACK_DISPLAY_NAME
}

/**
 * De-duplicates `name` against `taken` (case-insensitive) with a numeric
 * suffix, `Mina` → `Mina 2`, keeping the result within the length cap.
 */
export function dedupeDisplayName(
  name: string,
  taken: readonly string[],
): string {
  const lowerTaken = new Set(taken.map((entry) => entry.toLowerCase()))
  if (!lowerTaken.has(name.toLowerCase())) return name
  for (let suffix = 2; ; suffix += 1) {
    const tail = ` ${suffix}`
    const base = truncateCodePoints(name, MAX_DISPLAY_NAME_LENGTH - tail.length)
    const candidate = `${base}${tail}`
    if (!lowerTaken.has(candidate.toLowerCase())) return candidate
  }
}
