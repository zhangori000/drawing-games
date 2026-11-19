import { describe, expect, it } from 'vitest'

import { boundedMemo } from './memo'

describe('boundedMemo', () => {
  it('computes each input once and stays within its limit', () => {
    const seen: string[] = []
    const upper = boundedMemo((input) => {
      seen.push(input)
      return input.toUpperCase()
    }, 2)
    expect(upper('a')).toBe('A')
    expect(upper('a')).toBe('A')
    expect(upper('b')).toBe('B')
    expect(seen).toEqual(['a', 'b'])
    expect(upper('c')).toBe('C')
    expect(upper('a')).toBe('A')
    expect(seen).toEqual(['a', 'b', 'c', 'a'])
  })

  it('caches falsy results too', () => {
    let calls = 0
    const empty = boundedMemo(() => {
      calls += 1
      return ''
    })
    empty('x')
    empty('x')
    expect(calls).toBe(1)
  })
})
