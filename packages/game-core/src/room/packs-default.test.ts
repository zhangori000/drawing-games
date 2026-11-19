import { CURATED_PACKS, WORD_PACKS } from '@drawing-games/word-bank'
import { describe, expect, it } from 'vitest'

import { DEFAULT_ROOM_PACK_IDS, DEFAULT_ROOM_SETTINGS } from './settings'

describe('default room packs', () => {
  it('match the word-bank defaultEnabled flags, in display order', () => {
    expect([...DEFAULT_ROOM_PACK_IDS]).toEqual(
      WORD_PACKS.filter((pack) => pack.defaultEnabled).map((pack) => pack.id),
    )
  })

  it('all exist as curated packs with words', () => {
    const curated = new Map(CURATED_PACKS.map((pack) => [pack.id, pack]))
    for (const packId of DEFAULT_ROOM_PACK_IDS) {
      expect(curated.get(packId)?.words.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('are what a new room starts with', () => {
    expect(DEFAULT_ROOM_SETTINGS.packIds).toEqual(DEFAULT_ROOM_PACK_IDS)
  })
})
