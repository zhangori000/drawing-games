import { describe, expect, it } from 'vitest'

import {
  BOT_FONT_CHARACTERS,
  BOT_TEXT_BOUNDS,
  type BotStroke,
  layoutBotText,
  renderTextStrokes,
} from './bot-font'

const LETTERS_AND_DIGITS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789']

function bounds(strokes: readonly BotStroke[]) {
  const points = strokes.flat()
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

function expectWellFormed(strokes: readonly BotStroke[]) {
  for (const stroke of strokes) {
    expect(stroke.length).toBeGreaterThanOrEqual(2)
    for (const { x, y } of stroke) {
      expect(x).toBeGreaterThanOrEqual(BOT_TEXT_BOUNDS.left)
      expect(x).toBeLessThanOrEqual(BOT_TEXT_BOUNDS.right)
      expect(y).toBeGreaterThanOrEqual(BOT_TEXT_BOUNDS.top)
      expect(y).toBeLessThanOrEqual(BOT_TEXT_BOUNDS.bottom)
      expect(Math.round(x * 10_000) / 10_000).toBe(x)
      expect(Math.round(y * 10_000) / 10_000).toBe(y)
    }
  }
}

describe('renderTextStrokes', () => {
  it('covers A-Z, 0-9, hyphen, and apostrophe', () => {
    expect([...BOT_FONT_CHARACTERS].sort()).toEqual(
      [...LETTERS_AND_DIGITS, '-', "'"].sort(),
    )
  })

  it.each(LETTERS_AND_DIGITS)('draws %s with at least one stroke', (char) => {
    const strokes = renderTextStrokes(char)
    expect(strokes.length).toBeGreaterThanOrEqual(1)
    expectWellFormed(strokes)
  })

  it('uppercases input', () => {
    expect(renderTextStrokes('cat')).toEqual(renderTextStrokes('CAT'))
  })

  it('folds accents and skips characters it cannot draw', () => {
    expect(renderTextStrokes('crème brûlée')).toEqual(
      renderTextStrokes('CREME BRULEE'),
    )
    expect(renderTextStrokes('cat!?')).toEqual(renderTextStrokes('cat'))
    expect(renderTextStrokes('🐱 cat')).toEqual(renderTextStrokes('cat'))
    expect(renderTextStrokes('dragon’s')).toEqual(renderTextStrokes("dragon's"))
  })

  it.each(['', '   ', '!!!', '🐱🐶'])('returns no strokes for %j', (text) => {
    expect(renderTextStrokes(text)).toEqual([])
  })

  it('keeps every point inside the writing box', () => {
    const samples = [
      'A',
      'cat',
      'W',
      "jack-o'-lantern",
      'raining cats and dogs',
      'supercalifragilisticexpialidocious',
      'a b c d e f g h i j k l m n o p q r s t u v w x y z',
      'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    ]
    for (const text of samples) {
      const strokes = renderTextStrokes(text)
      expect(strokes.length).toBeGreaterThan(0)
      expectWellFormed(strokes)
    }
  })

  it('centers the text block', () => {
    const box = bounds(renderTextStrokes('HOUSE'))
    const centerX = (BOT_TEXT_BOUNDS.left + BOT_TEXT_BOUNDS.right) / 2
    const centerY = (BOT_TEXT_BOUNDS.top + BOT_TEXT_BOUNDS.bottom) / 2
    expect((box.minX + box.maxX) / 2).toBeCloseTo(centerX, 2)
    expect((box.minY + box.maxY) / 2).toBeCloseTo(centerY, 2)
  })

  it('corrects glyph proportions for the 4:3 canvas', () => {
    // H is 0.55 em wide: on a 4:3 canvas its x-span is 0.55 · height · 3/4.
    const box = bounds(renderTextStrokes('H'))
    const height = box.maxY - box.minY
    expect(box.maxX - box.minX).toBeCloseTo(0.55 * height * 0.75, 3)
  })

  it('wraps long phrases at spaces onto multiple lines', () => {
    const layout = layoutBotText('raining cats and dogs all day long')
    expect(layout.lines.length).toBeGreaterThan(1)
    expect(layout.lines.join(' ')).toBe('RAINING CATS AND DOGS ALL DAY LONG')
    for (const line of layout.lines) {
      expect(line).not.toMatch(/^ | $/)
    }

    const strokes = renderTextStrokes('raining cats and dogs all day long')
    const lineTops = new Set(
      strokes.map((stroke) => Math.min(...stroke.map((point) => point.y))),
    )
    const box = bounds(strokes)
    expect(box.maxY - box.minY).toBeGreaterThan(2 * layout.glyphHeight)
    expect(lineTops.size).toBeGreaterThan(1)
  })

  it('keeps a single word on one line and shrinks it to fit', () => {
    const short = layoutBotText('cat')
    const long = layoutBotText('supercalifragilisticexpialidocious')
    expect(short.lines).toEqual(['CAT'])
    expect(long.lines).toEqual(['SUPERCALIFRAGILISTICEXPIALIDOCIOUS'])
    expect(long.glyphHeight).toBeLessThan(short.glyphHeight)
    expect(short.glyphHeight).toBeLessThanOrEqual(0.3)
  })

  it('is deterministic', () => {
    expect(renderTextStrokes('hermit crab')).toEqual(
      renderTextStrokes('hermit crab'),
    )
  })
})
