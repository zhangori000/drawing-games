import { expect, test } from 'vitest'

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
  LEGACY_WORD_HISTORY_KEY,
  WORD_HISTORY_KEY,
  countRememberedWords,
  getWordHistory,
  recordWordHistory,
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
  recordWordHistory({ soft: ['animals/cat', 'food/pizza'] })
  recordWordHistory({ soft: ['animals/cat', 'Bad Id', 'nature/volcano'] })
  expect(getWordHistory()).toEqual({
    avoid: [],
    soft: ['animals/cat', 'nature/volcano', 'food/pizza'],
  })

  const many = Array.from({ length: 400 }, (_, index) => `pack/word-${index}`)
  recordWordHistory({ soft: many, avoid: many })
  const history = getWordHistory()
  expect(history.avoid).toHaveLength(300)
  expect(history.avoid[0]).toBe('pack/word-0')
  // Soft never repeats an avoided word, and still keeps up to 300.
  expect(history.soft.some((id) => history.avoid.includes(id))).toBe(false)
  expect(history.soft[0]).toBe('pack/word-300')

  local.setItem(WORD_HISTORY_KEY, '{not json')
  expect(getWordHistory()).toEqual({ avoid: [], soft: [] })
})

test('words a guest drew or reported "seen it" stay strict when met again', () => {
  installMemoryStorage()
  recordWordHistory({ soft: ['food/pizza', 'animals/cat'] })
  // Drew the cat: it moves from soft to avoid.
  recordWordHistory({ avoid: ['animals/cat'], soft: ['nature/volcano'] })
  // Seen again later as the other team's word: still avoided.
  recordWordHistory({ soft: ['animals/cat'] })
  expect(getWordHistory()).toEqual({
    avoid: ['animals/cat'],
    soft: ['nature/volcano', 'food/pizza'],
  })
  expect(countRememberedWords()).toBe(3)
})

test('a v1 history (one soft list) moves into v2 once', () => {
  const { local } = installMemoryStorage()
  local.setItem(
    LEGACY_WORD_HISTORY_KEY,
    JSON.stringify(['animals/cat', 'BAD', 'food/pizza']),
  )
  expect(getWordHistory()).toEqual({
    avoid: [],
    soft: ['animals/cat', 'food/pizza'],
  })
  expect(local.getItem(LEGACY_WORD_HISTORY_KEY)).toBeNull()
  expect(JSON.parse(local.getItem(WORD_HISTORY_KEY) ?? 'null')).toEqual({
    avoid: [],
    soft: ['animals/cat', 'food/pizza'],
  })
  recordWordHistory({ avoid: ['food/pizza'] })
  expect(getWordHistory()).toEqual({
    avoid: ['food/pizza'],
    soft: ['animals/cat'],
  })
})

test('room code input is trimmed, uppercased, and stripped of spaces/dashes', () => {
  expect(normalizeRoomCodeInput('  ab-c d5 ')).toBe('ABCD5')
  expect(normalizeRoomCodeInput('abc')).toBeNull()
  expect(normalizeRoomCodeInput('ABCDEFGHJ')).toBeNull()
  expect(normalizeRoomCodeInput('AB!CD')).toBeNull()
  expect(formatRoomCodeInput('ab-cd efghij')).toBe('ABCDEFGH')
})
