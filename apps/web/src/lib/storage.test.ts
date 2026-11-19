import { expect, test } from '@playwright/test'

import {
  forgetSeat,
  getTabSessionId,
  loadLatestSeat,
  loadTabSeat,
  saveSeat,
  updateSeatDisplayName,
} from './identity'
import {
  formatRoomCodeInput,
  normalizeRoomCodeInput,
} from './realtime/rooms-api'
import { installMemoryStorage } from './testing/memory-storage'
import {
  WORD_HISTORY_KEY,
  getRecentWordIds,
  recordWordIds,
} from './word-history'

const TOKEN_A = 'token-aaaaaaaaaaaaaaaaaaaa'
const TOKEN_B = 'token-bbbbbbbbbbbbbbbbbbbb'

test('seats: a tab resumes its own seat; other tabs see the latest as an offer', () => {
  const { session } = installMemoryStorage()
  saveSeat('ABCDE', {
    memberId: 'ana',
    resumeToken: TOKEN_A,
    displayName: 'Ana',
  })
  expect(loadTabSeat('ABCDE')?.memberId).toBe('ana')

  // A second tab (fresh sessionStorage) joins as someone new.
  const firstTab = new Map([['dd.tab.ABCDE', session.getItem('dd.tab.ABCDE')]])
  session.clear()
  expect(loadTabSeat('ABCDE')).toBeNull()
  expect(loadLatestSeat('ABCDE')?.displayName).toBe('Ana')
  saveSeat('ABCDE', {
    memberId: 'ben',
    resumeToken: TOKEN_B,
    displayName: 'Ben',
  })

  // Back in the first tab: its own seat still resumes.
  session.clear()
  session.setItem('dd.tab.ABCDE', firstTab.get('dd.tab.ABCDE') ?? '')
  expect(loadTabSeat('ABCDE')).toMatchObject({
    memberId: 'ana',
    resumeToken: TOKEN_A,
  })
  expect(loadLatestSeat('ABCDE')?.memberId).toBe('ben')
})

test('seats: names follow the room, and forgetting clears only that seat', () => {
  installMemoryStorage()
  saveSeat('ABCDE', {
    memberId: 'ana',
    resumeToken: TOKEN_A,
    displayName: 'Ana',
  })
  updateSeatDisplayName('ABCDE', 'ana', 'Ana 2')
  expect(loadTabSeat('ABCDE')?.displayName).toBe('Ana 2')
  expect(loadLatestSeat('ABCDE')?.displayName).toBe('Ana 2')

  forgetSeat('ABCDE')
  expect(loadTabSeat('ABCDE')).toBeNull()
  expect(loadLatestSeat('ABCDE')).toBeNull()
})

test('seats: malformed or expired entries are ignored', () => {
  const { local } = installMemoryStorage()
  local.setItem(
    'dd.seat.ABCDE',
    JSON.stringify({ memberId: 'x', resumeToken: 'short' }),
  )
  expect(loadLatestSeat('ABCDE')).toBeNull()
  local.setItem(
    'dd.seat.OLD12',
    JSON.stringify({
      memberId: 'old',
      resumeToken: TOKEN_A,
      displayName: 'Old',
      savedAtMs: 0,
    }),
  )
  saveSeat('ABCDE', {
    memberId: 'ana',
    resumeToken: TOKEN_A,
    displayName: 'Ana',
  })
  expect(local.getItem('dd.seat.OLD12')).toBeNull()
})

test('tab session id is opaque, protocol-safe, and stable per tab', () => {
  installMemoryStorage()
  const id = getTabSessionId()
  expect(id).toMatch(/^[A-Za-z0-9_-]{16,128}$/)
  expect(getTabSessionId()).toBe(id)
})

test('word history keeps 300 newest valid ids without duplicates', () => {
  const { local } = installMemoryStorage()
  recordWordIds(['animals/cat', 'food/pizza'])
  recordWordIds(['animals/cat', 'Bad Id', 'nature/volcano'])
  expect(getRecentWordIds()).toEqual([
    'animals/cat',
    'nature/volcano',
    'food/pizza',
  ])

  recordWordIds(Array.from({ length: 400 }, (_, index) => `pack/word-${index}`))
  const ids = getRecentWordIds()
  expect(ids).toHaveLength(300)
  expect(ids[0]).toBe('pack/word-0')

  local.setItem(WORD_HISTORY_KEY, '{not json')
  expect(getRecentWordIds()).toEqual([])
})

test('room code input is trimmed, uppercased, and stripped of spaces/dashes', () => {
  expect(normalizeRoomCodeInput('  ab-c d5 ')).toBe('ABCD5')
  expect(normalizeRoomCodeInput('abc')).toBeNull()
  expect(normalizeRoomCodeInput('ABCDEFGHJ')).toBeNull()
  expect(normalizeRoomCodeInput('AB!CD')).toBeNull()
  expect(formatRoomCodeInput('ab-cd efghij')).toBe('ABCDEFGH')
})
