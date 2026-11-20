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
import { describePattern, patternWords, revealState } from './clue'
import {
  CUSTOM_WORD_LIMITS,
  formatWithSkipped,
  mergeCustomWords,
  parseCustomWords,
} from './custom-words'
import {
  breakdownParts,
  breakdownSentence,
  difficultyStake,
  finalResultLine,
  formatSeconds,
  leaveRoomDescription,
  phaseLabel,
} from './format'
import { playLayoutMode } from './layout-mode'
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
          matchCredit: null,
        }
      : null,
    settings: { ...DEFAULT_ROOM_SETTINGS, customWordCount: 0 },
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
  expect(parsed.skipped).toEqual([
    { entry: 'x', reason: 'length' },
    { entry: 'y'.repeat(33), reason: 'length' },
  ])
})

test('custom words: an import keeps the host’s skipped entries below the list', () => {
  const typed = parseCustomWords('kite, tree house|mediun\nx')
  const text = formatWithSkipped(['kite', 'lava lamp|easy'], typed.skipped)
  expect(text).toBe('kite\nlava lamp|easy\ntree house|mediun\nx')
  // The box still describes exactly the imported list, and still flags them.
  const again = parseCustomWords(text)
  expect(again.words).toEqual(['kite', 'lava lamp|easy'])
  expect(again.skipped).toEqual(typed.skipped)
})

test('custom words: lengths count characters, and kept words fit the wire schema', () => {
  // 32 emoji are 32 characters for the room and the protocol alike, though
  // 64 UTF-16 units; one character more is too long for both.
  const party = '🎉'.repeat(CUSTOM_WORD_LIMITS.maxLength)
  const parsed = parseCustomWords(`${party}\n${party}🎉\nkite`)
  expect(parsed.words).toEqual([party, 'kite'])
  expect(parsed.invalid).toBe(1)
  const patch = { customWords: [...parsed.words] }
  expect(roomSettingsPatchSchema.safeParse(patch).success).toBe(true)
  expect(
    roomSettingsPatchSchema.safeParse({ customWords: [`${party}🎉`] }).success,
  ).toBe(false)
})

test('custom words: difficulty tags are kept canonical, bad ones skipped', () => {
  const parsed = parseCustomWords(
    'paper shredder | HARD, kite|easy\nKite|hard\npizza night\ntypo|huge\n' +
      `${'y'.repeat(CUSTOM_WORD_LIMITS.maxLength)}|medium`,
  )
  expect(parsed.words).toEqual([
    'paper shredder|hard',
    'kite|easy',
    'pizza night',
    `${'y'.repeat(CUSTOM_WORD_LIMITS.maxLength)}|medium`,
  ])
  expect(parsed).toMatchObject({ badTags: 1, duplicates: 1, invalid: 0 })
  expect(parsed.skipped).toEqual([{ entry: 'typo|huge', reason: 'tag' }])
  // The tag does not count toward the length, for the room or the wire.
  expect(
    roomSettingsPatchSchema.safeParse({ customWords: [...parsed.words] })
      .success,
  ).toBe(true)
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

test('clue: compact patterns drop letter spacing but keep words apart', () => {
  expect(patternWords('_ _ _ _ _')).toEqual(['_____'])
  expect(patternWords('_ _ A   _ _')).toEqual(['__A', '__'])
  expect(patternWords('  _ _  ')).toEqual(['__'])
  expect(patternWords('')).toEqual([])
})

/* --------------------------- final and leave copy --------------------------- */

test('the final banner only calls a loss "so close" when it was', () => {
  expect(finalResultLine('lost', 87 - 217)).toBe(
    'Their match. Shake it off and run it back?',
  )
  expect(finalResultLine('lost', -20)).toBe('So close. Run it back?')
  expect(finalResultLine('lost', 30)).toBe('So close. Run it back?')
  expect(finalResultLine('lost', -75)).toBe('Not this time. Run it back?')
  expect(finalResultLine('won', 12)).toBe('Down to the wire. Nicely drawn.')
  expect(finalResultLine('won', -140)).toBe('Your team took it. Nicely drawn.')
})

test('the leave dialog says a solo practice match ends when you leave', () => {
  const inMatch = (members: MemberView[]): RoomView => ({
    ...lobbyView(members, 'me'),
    phase: 'drawing',
  })
  const me = member('me')
  const solo = inMatch([
    me,
    member('bot-1', { kind: 'bot' }),
    member('bot-2', { kind: 'bot', team: 'B' }),
  ])
  expect(leaveRoomDescription(solo)).toMatch(/practice match ends/)

  const othersAway = inMatch([
    me,
    member('ana', { team: 'B', connected: false }),
  ])
  expect(leaveRoomDescription(othersAway)).toMatch(/Nobody else is connected/)

  const withTeam = inMatch([me, member('ana'), member('cy', { team: 'B' })])
  expect(leaveRoomDescription(withTeam)).toBe(
    'Your team keeps playing without you, and your seat is given up.',
  )
  const alone = inMatch([me, member('cy', { team: 'B' })])
  expect(leaveRoomDescription(alone)).toBe(
    'The match goes on without you, and your seat is given up.',
  )
  expect(leaveRoomDescription(lobbyView([me], 'me'))).toBe(
    'You can come back any time with the room code.',
  )
})

/* ------------------------------- play layout ------------------------------- */

test('play layout: phones, tablets and desktops get the layout their screen fits', () => {
  // Portrait phone, landscape phones, a landscape tablet, a desktop.
  expect(playLayoutMode(412, 915, true)).toBe('stacked')
  expect(playLayoutMode(844, 390, true)).toBe('wide-short')
  expect(playLayoutMode(863, 360, true)).toBe('wide-short')
  expect(playLayoutMode(1138, 712, true)).toBe('wide')
  expect(playLayoutMode(1280, 800, false)).toBe('wide')
  // A narrow desktop window stacks; a short wide one is still side by side.
  expect(playLayoutMode(800, 900, false)).toBe('stacked')
  expect(playLayoutMode(1280, 480, false)).toBe('wide-short')
  // An unfolded foldable in portrait stacks (aspect under 4:3).
  expect(playLayoutMode(884, 1104, true)).toBe('stacked')
})

test('play layout: given the keyboard-closed height, a soft keyboard never switches layouts', () => {
  // The visible heights with a keyboard up would have flipped the layout...
  expect(playLayoutMode(1138, 392, true)).toBe('wide-short')
  expect(playLayoutMode(884, 662, true)).toBe('wide')
  // ...so the layout is decided on the height with the keyboard closed.
  expect(playLayoutMode(1138, 712, true)).toBe('wide')
  expect(playLayoutMode(884, 1104, true)).toBe('stacked')
})
