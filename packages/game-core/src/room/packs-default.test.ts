import { CURATED_PACKS, WORD_PACKS } from '@drawing-games/word-bank'
import { describe, expect, it } from 'vitest'

import { DEFAULT_ROOM_PACK_IDS, DEFAULT_ROOM_SETTINGS } from './settings'
import { RoomDriver } from './test-driver'
import { roomPool, toDraftOption } from './words'

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

describe('words that moved packs', () => {
  it('keep a player memory that still holds the old id', () => {
    const driver = new RoomDriver({ seed: 4 })
    driver.join('ana', 'Ana', {
      team: 'A',
      memory: {
        avoid: ['space-science/hand', 'body-health/hand', 'animals/cat'],
        soft: ['space-science/elevator'],
      },
    })
    expect(driver.state.members[0]!.memory).toEqual({
      avoid: ['body-health/hand', 'animals/cat'],
      soft: ['places/elevator'],
    })
  })

  it('give body words the Body & Health category', () => {
    const pool = roomPool(DEFAULT_ROOM_SETTINGS)
    const hand = pool.find((word) => word.term === 'hand')!
    expect(toDraftOption(hand)).toMatchObject({
      wordId: 'body-health/hand',
      packName: 'Body & Health',
    })
    expect(pool.find((word) => word.term === 'sunburn')?.packId).toBe(
      'body-health',
    )
    expect(pool.find((word) => word.term === 'escalator')?.packId).toBe(
      'places',
    )
  })
})
