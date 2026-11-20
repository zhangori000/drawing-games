import { DEFAULT_ROOM_SETTINGS } from '@drawing-games/game-core'
import { describe, expect, it } from 'vitest'

import { RoomCommandError } from '@/lib/realtime/command-error'

import {
  mergeDraft,
  settleBatch,
  shouldRetryAlone,
  stillCurrent,
  takePending,
  toPatch,
  type DraftEntries,
  type DraftEntry,
} from './settings-draft-core'
import { togglePackIds } from './settings-options'

const server = DEFAULT_ROOM_SETTINGS

function pending(value: DraftEntry['value'], token: number): DraftEntry {
  return { value, phase: 'pending', token, ackedFor: null }
}

describe('togglePackIds', () => {
  const base = {
    packIds: ['animals', 'food'],
    customWords: [] as string[],
    customWordsMode: 'mix' as const,
    wordChoiceCount: 3,
  }

  it('turns a pack on or off', () => {
    expect(togglePackIds(base, 'sports')).toEqual({
      packIds: ['animals', 'food', 'sports'],
    })
    expect(togglePackIds(base, 'food')).toEqual({ packIds: ['animals'] })
  })

  it('refuses to switch off the last pack, so no empty list is sent', () => {
    const result = togglePackIds({ ...base, packIds: ['animals'] }, 'animals')
    expect(result).toEqual({
      refused:
        'Keep at least one word pack on, or use only your own words (at least 6).',
    })
  })

  it('lets every pack go when the room plays only enough custom words', () => {
    const words = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6']
    const only = {
      ...base,
      packIds: ['animals'],
      customWordsMode: 'only' as const,
    }
    expect(togglePackIds({ ...only, customWords: words }, 'animals')).toEqual({
      packIds: [],
    })
    expect(
      togglePackIds({ ...only, customWords: words.slice(0, 5) }, 'animals'),
    ).toHaveProperty('refused')
    // Mixed into packs, custom words alone are not enough.
    expect(
      togglePackIds(
        { ...only, customWordsMode: 'mix', customWords: words },
        'animals',
      ),
    ).toHaveProperty('refused')
  })

  it('keeps every quick tap when clearing all packs but one', () => {
    // Taps made within the debounce merge into one packIds edit; each tap
    // starts from the draft, so the merged value is never empty.
    let packIds: readonly string[] = ['animals', 'food', 'sports']
    const refused: string[] = []
    for (const packId of ['animals', 'food', 'sports']) {
      const result = togglePackIds({ ...base, packIds }, packId)
      if ('packIds' in result) packIds = result.packIds
      else refused.push(packId)
    }
    expect(packIds).toEqual(['sports'])
    expect(refused).toEqual(['sports'])
  })
})

describe('settings draft bookkeeping', () => {
  it('sends pending edits as one batch and keeps acked ones until the view catches up', () => {
    const acked: DraftEntry = {
      value: 4,
      phase: 'acked',
      token: 1,
      ackedFor: server,
    }
    const entries: DraftEntries = {
      rounds: acked,
      drawingSeconds: pending(60, 2),
    }
    const { next, batch } = takePending(entries, server)
    expect(batch.map(([key]) => key)).toEqual(['drawingSeconds'])
    expect(next.drawingSeconds?.phase).toBe('sent')
    expect(next.rounds).toBe(acked)
    // A newer room view already holds the acked edit.
    const newer = { ...server, rounds: 4 }
    expect(takePending(entries, newer).next.rounds).toBeUndefined()
  })

  it('settles only the edits nothing newer replaced', () => {
    const sent = takePending(
      { rounds: pending(4, 1), drawingSeconds: pending(60, 2) },
      server,
    )
    // The host changed rounds again while the batch was in flight.
    const later: DraftEntries = { ...sent.next, rounds: pending(8, 3) }
    const refused = settleBatch(later, sent.batch, false, server)
    expect(refused.rounds?.value).toBe(8)
    expect(refused.drawingSeconds).toBeUndefined()
    expect(stillCurrent(later, sent.batch).map(([key]) => key)).toEqual([
      'drawingSeconds',
    ])

    const accepted = settleBatch(later, sent.batch, true, server)
    expect(accepted.drawingSeconds).toMatchObject({
      phase: 'acked',
      ackedFor: server,
    })
    expect(mergeDraft(server, accepted)).toMatchObject({
      rounds: 8,
      drawingSeconds: 60,
    })
  })

  it('retries a refused batch one edit at a time only when a rule refused it', () => {
    const { batch } = takePending(
      { rounds: pending(4, 1), packIds: pending([], 2) },
      server,
    )
    const rule = new RoomCommandError('BAD_COMMAND', 'Turn on a pack.')
    expect(shouldRetryAlone(batch, rule)).toBe(true)
    expect(shouldRetryAlone(batch.slice(0, 1), rule)).toBe(false)
    expect(
      shouldRetryAlone(batch, new RoomCommandError('CLOSED', 'Offline')),
    ).toBe(false)
    expect(
      shouldRetryAlone(batch, new RoomCommandError('NOT_ALLOWED', 'Host only')),
    ).toBe(false)
    expect(toPatch(batch)).toEqual({ rounds: 4, packIds: [] })
  })
})
