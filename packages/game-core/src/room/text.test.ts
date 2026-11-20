import { describe, expect, it } from 'vitest'

import {
  cleanDisplayName,
  cleanText,
  hasVisibleCharacter,
  sanitizeDisplayName,
} from './text'

describe('display name cleaning', () => {
  it('rejects names made only of invisible or blank characters', () => {
    for (const raw of [
      '',
      '   ',
      '​​', // zero-width spaces
      '‍', // zero-width joiner
      '‮', // right-to-left override
      '⁦⁩', // bidi isolates
      '؜', // Arabic letter mark
      '­', // soft hyphen
      '⁠﻿', // word joiner, BOM
      '\u{e0041}\u{e0042}', // tag characters
      '́̈', // combining marks alone
      '️', // variation selector alone
      'ㅤᅟﾠ', // Hangul fillers
      '⠀', // braille blank
      ' ​ ‮ ',
    ]) {
      expect(cleanDisplayName(raw), JSON.stringify(raw)).toBeNull()
      expect(sanitizeDisplayName(raw)).toBe('Player')
    }
    expect(cleanDisplayName(42)).toBeNull()
  })

  it('strips invisible characters around visible ones', () => {
    expect(cleanDisplayName('‮Mina​ Lee⁦')).toBe('Mina Lee')
    expect(cleanDisplayName('  Ink ­\n  Master ')).toBe('Ink Master')
    expect(cleanDisplayName('José')).toBe('José')
    expect(cleanDisplayName('é')).toBe('é')
    expect(cleanDisplayName('😀')).toBe('😀')
    expect(cleanDisplayName('李')).toBe('李')
  })

  it('caps length in code points', () => {
    expect(cleanDisplayName('x'.repeat(40))).toHaveLength(24)
    expect(cleanDisplayName('x'.repeat(40), 10)).toHaveLength(10)
    expect(Array.from(cleanDisplayName('😀'.repeat(30)) ?? '')).toHaveLength(24)
  })

  it('tells visible text from blank text', () => {
    expect(hasVisibleCharacter('a')).toBe(true)
    expect(hasVisibleCharacter(' ́ ')).toBe(false)
    expect(cleanText('a​b‮c')).toBe('abc')
  })
})
