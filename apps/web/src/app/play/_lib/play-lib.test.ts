import {
  DEFAULT_ROOM_SETTINGS,
  type HintView,
  type MemberView,
  type RoomView,
  type TeamView,
} from '@drawing-games/game-core'
import { roomSettingsPatchSchema } from '@drawing-games/protocol'
import { expect, test } from 'vitest'

import { installMemoryStorage } from '../../../lib/testing/memory-storage'
import { describePattern, revealState } from './clue'
import {
  CUSTOM_WORD_LIMITS,
  mergeCustomWords,
  parseCustomWords,
} from './custom-words'
import {
  breakdownParts,
  breakdownSentence,
  difficultyStake,
  formatSeconds,
  phaseLabel,
} from './format'
import { claimPracticeSetup, practiceBotPlan } from './practice'
import { ROUND_CHOICES, stepValue } from './settings-options'
import { parseWordLibrary } from './word-library'

/* -------------------------------- fixtures -------------------------------- */

function member(id: string, overrides: Partial<MemberView> = {}): MemberView {
  return {
    id,
    displayName: id,
    team: 'A',
    kind: 'human',
    connected: true,
    ready: false,
    isHost: false,
    isDrawer: false,
    hasAccount: false,
    ...overrides,
  }
}

function team(id: 'A' | 'B', memberIds: string[]): TeamView {
  return {
    id,
    name: id === 'A' ? 'Sun' : 'Moon',
    score: 0,
    roundsWon: 0,
    memberIds,
    drawerId: null,
  }
}

function lobbyView(members: MemberView[], meId: string | null): RoomView {
  const me = members.find((entry) => entry.id === meId) ?? null
  return {
    roomCode: 'ABCDE',
    seq: 1,
    phase: 'lobby',
    phaseStartedAtMs: 0,
    phaseDeadlineAtMs: null,
    hostId: members.find((entry) => entry.isHost)?.id ?? null,
    me: me
      ? {
          memberId: me.id,
          team: me.team,
          isHost: me.isHost,
          role: 'idle',
          accountId: null,
        }
      : null,
    settings: DEFAULT_ROOM_SETTINGS,
    members,
    teams: {
      A: team(
        'A',
        members.filter((m) => m.team === 'A').map((m) => m.id),
      ),
      B: team(
        'B',
        members.filter((m) => m.team === 'B').map((m) => m.id),
      ),
    },
    lobby: null,
    match: null,
    round: null,
    results: null,
    showdown: null,
    final: null,
    surrender: null,
  }
}

function hint(overrides: Partial<HintView> = {}): HintView {
  return {
    mode: 'hidden-vote',
    revealed: false,
    unlocksAtMs: 30_000,
    canVote: false,
    myVote: null,
    votesFor: 0,
    votesNeeded: 1,
    cost: 10,
    ...overrides,
  }
}

/* ------------------------------ custom words ------------------------------ */

test('custom words: split on commas and lines, cleaned and de-duplicated', () => {
  const parsed = parseCustomWords(
    'Pizza, pizza\n  ice   cream ,\r\nx\n\u200bTaco\u200b\n' + 'y'.repeat(33),
  )
  expect(parsed.words).toEqual(['Pizza', 'ice cream', 'Taco'])
  expect(parsed.duplicates).toBe(1)
  expect(parsed.invalid).toBe(2)
  expect(parsed.overLimit).toBe(0)
})

test('custom words: every kept word also fits the wire schema (UTF-16 units)', () => {
  // 20 code points (the room allows 32) but 40 UTF-16 units (the protocol
  // allows 32): keeping it would get the whole settings patch refused.
  const party = '🎉'.repeat(20)
  const parsed = parseCustomWords(`${party}\n${'🎉'.repeat(16)}\nkite`)
  expect(parsed.words).toEqual(['🎉'.repeat(16), 'kite'])
  expect(parsed.invalid).toBe(1)
  const patch = { customWords: [...parsed.words] }
  expect(roomSettingsPatchSchema.safeParse(patch).success).toBe(true)
})

test('custom words: keep at most the room maximum', () => {
  const many = Array.from(
    { length: CUSTOM_WORD_LIMITS.maxCount + 5 },
    (_, i) => `word ${i}`,
  )
  const parsed = parseCustomWords(many.join(','))
  expect(parsed.words).toHaveLength(CUSTOM_WORD_LIMITS.maxCount)
  expect(parsed.overLimit).toBe(5)
})

test('custom words: merging keeps existing spellings and counts additions', () => {
  const merged = mergeCustomWords(
    ['Cat', 'Dog'],
    ['dog', 'Bird', 'cat', 'Fish'],
  )
  expect(merged.words).toEqual(['Cat', 'Dog', 'Bird', 'Fish'])
  expect(merged.addedCount).toBe(2)
})

/* ------------------------------ word library ------------------------------ */

test('word library: master lists active playable words, collections resolve ids', () => {
  const library = parseWordLibrary({
    version: 1,
    words: [
      { id: 'w1', term: 'Lighthouse', status: 'active', eligibleForPlay: true },
      { id: 'w2', term: 'Volcano', status: 'inactive', eligibleForPlay: true },
      {
        id: 'w3',
        term: 'Strawberry',
        status: 'active',
        eligibleForPlay: false,
      },
      { id: 'w4', term: ' Kite ', status: 'active', eligibleForPlay: true },
    ],
    collections: [
      {
        id: 'c2',
        name: 'Zoo',
        kind: 'custom',
        status: 'active',
        wordIds: ['w4'],
      },
      {
        id: 'c1',
        name: 'Beach',
        kind: 'custom',
        status: 'active',
        wordIds: ['w1', 'w2', 'w4'],
      },
      {
        id: 'c3',
        name: 'Old',
        kind: 'custom',
        status: 'inactive',
        wordIds: ['w1'],
      },
    ],
  })
  expect(library).not.toBeNull()
  expect(library?.map((entry) => entry.name)).toEqual([
    'Master list',
    'Beach',
    'Zoo',
  ])
  expect(library?.[0]?.terms).toEqual(['Lighthouse', 'Kite'])
  expect(library?.[1]?.terms).toEqual(['Lighthouse', 'Kite'])
})

test('word library: anything else is not a library', () => {
  expect(parseWordLibrary(null)).toBeNull()
  expect(
    parseWordLibrary({ version: 2, words: [], collections: [] }),
  ).toBeNull()
  expect(parseWordLibrary({ version: 1, words: {} })).toBeNull()
})

/* -------------------------------- settings -------------------------------- */

test('settings: rounds are the even numbers 2–16', () => {
  expect(ROUND_CHOICES).toEqual([2, 4, 6, 8, 10, 12, 14, 16])
})

test('settings: steppers snap to the grid and clamp', () => {
  const spec = { min: 4, max: 20, step: 5 }
  expect(stepValue(8, spec, 1)).toBe(10)
  expect(stepValue(8, spec, -1)).toBe(5)
  expect(stepValue(5, spec, -1)).toBe(4)
  expect(stepValue(20, spec, 1)).toBe(20)
})

/* -------------------------------- practice -------------------------------- */

test('practice: a solo host gets one teammate bot and two opponents', () => {
  const view = lobbyView([member('me', { isHost: true, team: 'B' })], 'me')
  expect(practiceBotPlan(view)).toEqual(['B', 'A', 'A'])
})

test('practice: never when others or bots are already in the room', () => {
  const withBot = lobbyView(
    [member('me', { isHost: true }), member('bot_1', { kind: 'bot' })],
    'me',
  )
  expect(practiceBotPlan(withBot)).toBeNull()
  const notHost = lobbyView([member('me')], 'me')
  expect(practiceBotPlan(notHost)).toBeNull()
})

test('practice: setup is claimed once per room per tab', () => {
  installMemoryStorage()
  expect(claimPracticeSetup('PRAC1')).toBe(true)
  expect(claimPracticeSetup('PRAC1')).toBe(false)
  expect(claimPracticeSetup('PRAC2')).toBe(true)
})

/* --------------------------------- format --------------------------------- */

test('format: stakes, seconds, and the points sentence', () => {
  expect(difficultyStake('easy')).toBe('Easy')
  expect(difficultyStake('hard')).toBe('Hard · +40')
  expect(formatSeconds(12.34)).toBe('12.3s')
  expect(formatSeconds(75)).toBe('1:15')
  const breakdown = {
    secondsRemaining: 84,
    roundSeconds: 90,
    speedScore: 97,
    difficultyBonus: 40,
    hintCost: 10,
    total: 127,
  }
  expect(breakdownParts(breakdown, 'hard').map((part) => part.points)).toEqual([
    97, 40, -10,
  ])
  expect(
    breakdownSentence(
      { ...breakdown, difficultyBonus: 0, hintCost: 0, total: 97 },
      'easy',
    ),
  ).toBe('97 speed points for 84s left')
  expect(breakdownSentence(breakdown, 'hard')).toBe(
    '97 speed + 40 hard − 10 letter hint = 127',
  )
})

test('format: phase label shows round progress', () => {
  const view: RoomView = {
    ...lobbyView([member('me', { isHost: true })], 'me'),
    phase: 'drawing',
    match: {
      number: 1,
      roundNumber: 3,
      totalRounds: 6,
      completedRounds: 2,
      scores: { A: 0, B: 0 },
      winStreak: null,
    },
  }
  expect(phaseLabel(view)).toBe('Round 3/6')
})

/* ---------------------------------- clue ---------------------------------- */

test('clue: the reveal vote unlocks from the countdown', () => {
  const base = { solved: false, guessing: true }
  expect(
    revealState({ ...base, hint: hint(), secondsUntilUnlock: 12 }),
  ).toEqual({
    kind: 'locked',
    secondsLeft: 12,
  })
  expect(revealState({ ...base, hint: hint(), secondsUntilUnlock: 0 })).toEqual(
    {
      kind: 'open',
      voted: false,
    },
  )
  expect(
    revealState({
      ...base,
      hint: hint({ canVote: true, myVote: true }),
      secondsUntilUnlock: 0,
    }),
  ).toEqual({ kind: 'open', voted: true })
  expect(
    revealState({
      ...base,
      hint: hint({ revealed: true }),
      secondsUntilUnlock: 0,
    }).kind,
  ).toBe('revealed')
  expect(
    revealState({
      ...base,
      hint: hint({ mode: 'hidden' }),
      secondsUntilUnlock: null,
    }).kind,
  ).toBe('never')
  expect(
    revealState({ ...base, solved: true, hint: hint(), secondsUntilUnlock: 0 })
      .kind,
  ).toBe('closed')
})

test('clue: patterns read as letter counts', () => {
  expect(describePattern('_ _ _ _ _')).toBe('5 letters')
  expect(describePattern('_ _ _   _ _ _ _ _')).toBe('8 letters: 3 + 5')
})
