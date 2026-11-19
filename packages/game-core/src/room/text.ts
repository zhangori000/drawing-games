import { FALLBACK_DISPLAY_NAME, MAX_DISPLAY_NAME_LENGTH } from './constants'

/** C0/C1 controls plus zero-width and bidi-override characters. */
const INVISIBLE_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g

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

export function sanitizeDisplayName(raw: unknown): string {
  const cleaned = typeof raw === 'string' ? cleanText(raw) : ''
  const name = truncateCodePoints(cleaned, MAX_DISPLAY_NAME_LENGTH)
  return name.length > 0 ? name : FALLBACK_DISPLAY_NAME
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
