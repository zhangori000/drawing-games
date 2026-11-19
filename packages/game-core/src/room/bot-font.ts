import type { NormalizedPoint } from '@drawing-games/drawing-model'

/** One pen-down polyline in normalized canvas coordinates (0..1). */
export type BotStroke = readonly NormalizedPoint[]

/** Region the bot writes in, as canvas fractions (x and y both 0..1). */
export const BOT_TEXT_BOUNDS = Object.freeze({
  left: 0.06,
  right: 0.94,
  top: 0.12,
  bottom: 0.88,
})

/** Logical canvas width / height; x and y fractions are not isotropic. */
const CANVAS_ASPECT = 4 / 3
/** Cap height of a glyph as a fraction of canvas height. */
const MAX_GLYPH_HEIGHT = 0.3
/** Spacing in em (1 em = glyph height). */
const LETTER_GAP_EM = 0.22
const WORD_GAP_EM = 0.6
const LINE_GAP_EM = 0.45
const LAYOUT_SEARCH_STEPS = 40

interface Glyph {
  /** Advance width in em; strokes stay within x ∈ [0, width]. */
  readonly width: number
  /** Polylines in em, y down, cap height from y = 0 to y = 1. */
  readonly strokes: readonly (readonly (readonly [number, number])[])[]
}

/** Builds a glyph from flat `x, y, x, y, …` polylines. */
function glyph(width: number, ...polylines: readonly number[][]): Glyph {
  return {
    width,
    strokes: polylines.map((flat) => {
      const points: [number, number][] = []
      for (let index = 0; index + 1 < flat.length; index += 2) {
        points.push([flat[index] as number, flat[index + 1] as number])
      }
      return points
    }),
  }
}

const O_RING = [
  0.3, 0, 0.12, 0.06, 0.02, 0.25, 0, 0.5, 0.02, 0.75, 0.12, 0.94, 0.3, 1, 0.48,
  0.94, 0.58, 0.75, 0.6, 0.5, 0.58, 0.25, 0.48, 0.06, 0.3, 0,
]
const P_BOWL = [
  0, 1, 0, 0, 0.38, 0, 0.5, 0.06, 0.55, 0.25, 0.5, 0.44, 0.38, 0.5, 0, 0.5,
]

/**
 * Hand-designed single-stroke capitals and digits, in the spirit of the
 * Hershey simplex font: each glyph is one to three polylines, so a bot can
 * "draw" a word one pen stroke at a time.
 */
const GLYPHS: Readonly<Record<string, Glyph>> = {
  A: glyph(0.6, [0, 1, 0.3, 0, 0.6, 1], [0.12, 0.62, 0.48, 0.62]),
  B: glyph(
    0.55,
    [
      0, 0.5, 0.36, 0.5, 0.48, 0.42, 0.5, 0.25, 0.48, 0.08, 0.36, 0, 0, 0, 0, 1,
      0.4, 1, 0.52, 0.92, 0.55, 0.75, 0.52, 0.58, 0.4, 0.5,
    ],
  ),
  C: glyph(
    0.55,
    [
      0.55, 0.18, 0.45, 0.04, 0.28, 0, 0.12, 0.06, 0.02, 0.25, 0, 0.5, 0.02,
      0.75, 0.12, 0.94, 0.28, 1, 0.45, 0.96, 0.55, 0.82,
    ],
  ),
  D: glyph(
    0.55,
    [
      0, 0, 0, 1, 0.25, 1, 0.45, 0.9, 0.55, 0.65, 0.55, 0.35, 0.45, 0.1, 0.25,
      0, 0, 0,
    ],
  ),
  E: glyph(0.5, [0.5, 0, 0, 0, 0, 1, 0.5, 1], [0, 0.5, 0.38, 0.5]),
  F: glyph(0.5, [0.5, 0, 0, 0, 0, 1], [0, 0.5, 0.38, 0.5]),
  G: glyph(
    0.6,
    [
      0.55, 0.18, 0.45, 0.04, 0.28, 0, 0.12, 0.06, 0.02, 0.25, 0, 0.5, 0.02,
      0.75, 0.12, 0.94, 0.3, 1, 0.48, 0.96, 0.6, 0.82, 0.6, 0.55, 0.34, 0.55,
    ],
  ),
  H: glyph(0.55, [0, 0, 0, 1], [0.55, 0, 0.55, 1], [0, 0.5, 0.55, 0.5]),
  I: glyph(0.3, [0.15, 0, 0.15, 1], [0, 0, 0.3, 0], [0, 1, 0.3, 1]),
  J: glyph(0.5, [0.5, 0, 0.5, 0.72, 0.44, 0.92, 0.25, 1, 0.08, 0.94, 0, 0.75]),
  K: glyph(0.55, [0, 0, 0, 1], [0.55, 0, 0, 0.62], [0.18, 0.42, 0.55, 1]),
  L: glyph(0.45, [0, 0, 0, 1, 0.45, 1]),
  M: glyph(0.75, [0, 1, 0, 0, 0.375, 0.62, 0.75, 0, 0.75, 1]),
  N: glyph(0.6, [0, 1, 0, 0, 0.6, 1, 0.6, 0]),
  O: glyph(0.6, O_RING),
  P: glyph(0.55, P_BOWL),
  Q: glyph(0.6, O_RING, [0.36, 0.7, 0.6, 1]),
  R: glyph(0.55, P_BOWL, [0.3, 0.5, 0.55, 1]),
  S: glyph(
    0.55,
    [
      0.53, 0.14, 0.42, 0.03, 0.27, 0, 0.11, 0.04, 0.03, 0.16, 0.05, 0.32, 0.18,
      0.43, 0.38, 0.53, 0.51, 0.64, 0.55, 0.8, 0.47, 0.95, 0.3, 1, 0.12, 0.97,
      0, 0.86,
    ],
  ),
  T: glyph(0.6, [0, 0, 0.6, 0], [0.3, 0, 0.3, 1]),
  U: glyph(
    0.55,
    [0, 0, 0, 0.72, 0.07, 0.92, 0.275, 1, 0.48, 0.92, 0.55, 0.72, 0.55, 0],
  ),
  V: glyph(0.6, [0, 0, 0.3, 1, 0.6, 0]),
  W: glyph(0.8, [0, 0, 0.2, 1, 0.4, 0.35, 0.6, 1, 0.8, 0]),
  X: glyph(0.55, [0, 0, 0.55, 1], [0.55, 0, 0, 1]),
  Y: glyph(0.6, [0, 0, 0.3, 0.5, 0.6, 0], [0.3, 0.5, 0.3, 1]),
  Z: glyph(0.55, [0, 0, 0.55, 0, 0, 1, 0.55, 1]),
  '0': glyph(
    0.55,
    [
      0.275, 0, 0.1, 0.07, 0.02, 0.28, 0, 0.5, 0.02, 0.72, 0.1, 0.93, 0.275, 1,
      0.45, 0.93, 0.53, 0.72, 0.55, 0.5, 0.53, 0.28, 0.45, 0.07, 0.275, 0,
    ],
    // A slash keeps zero distinct from O.
    [0.46, 0.18, 0.09, 0.82],
  ),
  '1': glyph(0.35, [0.04, 0.2, 0.22, 0, 0.22, 1], [0.02, 1, 0.35, 1]),
  '2': glyph(
    0.55,
    [
      0.02, 0.2, 0.12, 0.05, 0.28, 0, 0.44, 0.04, 0.53, 0.18, 0.52, 0.36, 0.4,
      0.52, 0, 1, 0.55, 1,
    ],
  ),
  '3': glyph(
    0.55,
    [
      0.02, 0.1, 0.18, 0, 0.38, 0.01, 0.5, 0.1, 0.52, 0.26, 0.42, 0.4, 0.22,
      0.46, 0.42, 0.52, 0.54, 0.64, 0.55, 0.8, 0.45, 0.95, 0.27, 1, 0.1, 0.97,
      0, 0.88,
    ],
  ),
  '4': glyph(0.55, [0.42, 1, 0.42, 0, 0, 0.68, 0.55, 0.68]),
  '5': glyph(
    0.55,
    [
      0.52, 0, 0.08, 0, 0.04, 0.44, 0.2, 0.38, 0.38, 0.39, 0.5, 0.48, 0.55,
      0.66, 0.52, 0.86, 0.4, 0.97, 0.24, 1, 0.08, 0.96, 0, 0.86,
    ],
  ),
  '6': glyph(
    0.55,
    [
      0.5, 0.06, 0.34, 0, 0.17, 0.04, 0.06, 0.2, 0, 0.45, 0.01, 0.72, 0.08,
      0.91, 0.25, 1, 0.43, 0.95, 0.54, 0.8, 0.55, 0.65, 0.46, 0.5, 0.29, 0.45,
      0.12, 0.5, 0.02, 0.62,
    ],
  ),
  '7': glyph(0.55, [0, 0, 0.55, 0, 0.22, 1]),
  '8': glyph(
    0.55,
    [
      0.275, 0.46, 0.1, 0.38, 0.05, 0.22, 0.12, 0.06, 0.275, 0, 0.43, 0.06, 0.5,
      0.22, 0.45, 0.38, 0.275, 0.46, 0.08, 0.56, 0, 0.76, 0.08, 0.93, 0.275, 1,
      0.47, 0.93, 0.55, 0.76, 0.47, 0.56, 0.275, 0.46,
    ],
  ),
  '9': glyph(
    0.55,
    [
      0.53, 0.38, 0.43, 0.5, 0.26, 0.55, 0.09, 0.5, 0.01, 0.35, 0, 0.2, 0.1,
      0.05, 0.27, 0, 0.45, 0.05, 0.54, 0.2, 0.55, 0.45, 0.5, 0.72, 0.4, 0.92,
      0.22, 1, 0.05, 0.94,
    ],
  ),
  '-': glyph(0.4, [0.04, 0.55, 0.36, 0.55]),
  "'": glyph(0.15, [0.075, 0, 0.075, 0.26]),
}

/** Characters the bot font can draw (space is handled by layout). */
export const BOT_FONT_CHARACTERS: readonly string[] = Object.freeze(
  Object.keys(GLYPHS),
)

/** Uppercased, accent-folded words made only of drawable characters. */
function drawableWords(text: string): string[] {
  const folded = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[’‘`ʼ]/g, "'")
  return folded
    .split(/\s+/)
    .map((word) =>
      Array.from(word)
        .filter((char) => char in GLYPHS)
        .join(''),
    )
    .filter((word) => word.length > 0)
}

function wordWidthEm(word: string): number {
  const chars = Array.from(word)
  const glyphs = chars.reduce(
    (sum, char) => sum + (GLYPHS[char]?.width ?? 0),
    0,
  )
  return glyphs + LETTER_GAP_EM * Math.max(0, chars.length - 1)
}

function lineWidthEm(words: readonly string[]): number {
  const total = words.reduce((sum, word) => sum + wordWidthEm(word), 0)
  return total + WORD_GAP_EM * Math.max(0, words.length - 1)
}

/** Greedy wrap at spaces; a single over-long word gets a line of its own. */
function wrapWords(words: readonly string[], maxWidthEm: number): string[][] {
  const lines: string[][] = []
  let current: string[] = []
  for (const word of words) {
    const candidate = [...current, word]
    if (current.length > 0 && lineWidthEm(candidate) > maxWidthEm) {
      lines.push(current)
      current = [word]
    } else {
      current = candidate
    }
  }
  if (current.length > 0) lines.push(current)
  return lines
}

const BOX_WIDTH = BOT_TEXT_BOUNDS.right - BOT_TEXT_BOUNDS.left
const BOX_HEIGHT = BOT_TEXT_BOUNDS.bottom - BOT_TEXT_BOUNDS.top

/** Canvas-x span of `em` at glyph height `height` (canvas-y fraction). */
function emToX(em: number, height: number): number {
  return (em * height) / CANVAS_ASPECT
}

function blockHeight(lineCount: number, height: number): number {
  return height * (lineCount + LINE_GAP_EM * (lineCount - 1))
}

function layoutAt(words: readonly string[], height: number): string[][] | null {
  const lines = wrapWords(words, (BOX_WIDTH * CANVAS_ASPECT) / height)
  const fitsWidth = lines.every(
    (line) => emToX(lineWidthEm(line), height) <= BOX_WIDTH,
  )
  return fitsWidth && blockHeight(lines.length, height) <= BOX_HEIGHT
    ? lines
    : null
}

export interface BotTextLayout {
  /** Drawable text per line, words joined by single spaces. */
  readonly lines: readonly string[]
  /** Cap height as a fraction of canvas height. */
  readonly glyphHeight: number
}

/**
 * The largest glyph height (up to `MAX_GLYPH_HEIGHT`) at which the words,
 * wrapped at spaces, fit inside `BOT_TEXT_BOUNDS`. Smaller heights always fit
 * at least as well, so a bisection finds it deterministically.
 */
export function layoutBotText(text: string): BotTextLayout {
  const words = drawableWords(text)
  if (words.length === 0) return { lines: [], glyphHeight: 0 }
  let best = layoutAt(words, MAX_GLYPH_HEIGHT)
  let height = MAX_GLYPH_HEIGHT
  if (best === null) {
    let low = 0
    let high = MAX_GLYPH_HEIGHT
    for (let step = 0; step < LAYOUT_SEARCH_STEPS; step += 1) {
      const middle = (low + high) / 2
      const lines = layoutAt(words, middle)
      if (lines === null) {
        high = middle
      } else {
        low = middle
        best = lines
      }
    }
    height = low
  }
  return {
    lines: (best ?? [words]).map((line) => line.join(' ')),
    glyphHeight: height,
  }
}

function roundCoordinate(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value * 10_000) / 10_000))
}

/**
 * Lays out `text` (uppercased; A–Z, 0–9, space, hyphen, apostrophe; accents
 * folded; anything else skipped) as single-stroke glyph polylines, centered
 * inside `BOT_TEXT_BOUNDS` of the 4:3 canvas and wrapped at spaces. Glyph
 * proportions are corrected for the canvas aspect, so letters look the same
 * shape on every screen. Points are rounded to 4 decimals. Used by practice
 * bots so a human can test guessing alone.
 */
export function renderTextStrokes(text: string): BotStroke[] {
  const { lines, glyphHeight } = layoutBotText(text)
  if (lines.length === 0 || glyphHeight <= 0) return []
  const strokes: BotStroke[] = []
  const blockTop =
    BOT_TEXT_BOUNDS.top +
    (BOX_HEIGHT - blockHeight(lines.length, glyphHeight)) / 2

  lines.forEach((line, lineIndex) => {
    const words = line.split(' ')
    const lineLeft =
      BOT_TEXT_BOUNDS.left +
      (BOX_WIDTH - emToX(lineWidthEm(words), glyphHeight)) / 2
    const lineTop = blockTop + lineIndex * glyphHeight * (1 + LINE_GAP_EM)
    let cursorEm = 0
    words.forEach((word, wordIndex) => {
      if (wordIndex > 0) cursorEm += WORD_GAP_EM
      Array.from(word).forEach((char, charIndex) => {
        const shape = GLYPHS[char]
        if (shape === undefined) return
        if (charIndex > 0) cursorEm += LETTER_GAP_EM
        for (const polyline of shape.strokes) {
          strokes.push(
            polyline.map(([x, y]) => ({
              x: roundCoordinate(
                lineLeft + emToX(cursorEm + x, glyphHeight),
                BOT_TEXT_BOUNDS.left,
                BOT_TEXT_BOUNDS.right,
              ),
              y: roundCoordinate(
                lineTop + y * glyphHeight,
                BOT_TEXT_BOUNDS.top,
                BOT_TEXT_BOUNDS.bottom,
              ),
            })),
          )
        }
        cursorEm += shape.width
      })
    })
  })
  return strokes
}
