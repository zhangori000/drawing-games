import { describe, expect, it } from 'vitest'

import { formatCustomWordEntry, parseCustomWordEntry } from './custom-entry'

describe('parseCustomWordEntry', () => {
  it.each([
    ['kite', { term: 'kite', difficulty: null }],
    ['  pizza night ', { term: 'pizza night', difficulty: null }],
    ['paper shredder|hard', { term: 'paper shredder', difficulty: 'hard' }],
    ['kite | EASY ', { term: 'kite', difficulty: 'easy' }],
    ['Mr. Whiskers|Medium', { term: 'Mr. Whiskers', difficulty: 'medium' }],
  ] as const)('%j', (raw, entry) => {
    expect(parseCustomWordEntry(raw)).toEqual(entry)
  })

  it.each(['kite|huge', 'kite|', 'kite|hard|easy', '|hard|x'])(
    'refuses %j rather than keep a typo in the answer',
    (raw) => {
      expect(parseCustomWordEntry(raw)).toBeNull()
    },
  )

  it('round-trips through the canonical stored form', () => {
    for (const raw of ['kite', 'kite|hard', ' Kite |  Easy']) {
      const entry = parseCustomWordEntry(raw)
      expect(entry).not.toBeNull()
      if (entry === null) continue
      const stored = formatCustomWordEntry(entry)
      expect(parseCustomWordEntry(stored)).toEqual(entry)
    }
    expect(formatCustomWordEntry({ term: 'kite', difficulty: 'hard' })).toBe(
      'kite|hard',
    )
    expect(formatCustomWordEntry({ term: 'kite', difficulty: null })).toBe(
      'kite',
    )
  })
})
