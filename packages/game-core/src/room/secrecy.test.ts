import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { otherTeam, type TeamId } from '../types'
import type { OpponentDraftVisibility } from '../settings'
import { customWordList, RoomDriver } from './test-driver'
import type { WordLengthMode } from './settings'
import type { RoomCommand, RoomState, RoomView } from './types'
import { roomPool } from './words'

const HUMANS = ['ana', 'ben', 'cy', 'di'] as const

type Step =
  | { readonly kind: 'advance'; readonly ms: number }
  | { readonly kind: 'select'; readonly who: number; readonly option: number }
  | {
      readonly kind: 'replace'
      readonly who: number
      readonly option: number
      readonly seen: boolean
    }
  | {
      readonly kind: 'guess'
      readonly who: number
      readonly mode: 'wrong' | 'correct' | 'close'
    }
  | { readonly kind: 'hint'; readonly who: number; readonly approve: boolean }
  | { readonly kind: 'draw'; readonly who: number }
  | { readonly kind: 'continue' }
  | {
      readonly kind: 'presence'
      readonly who: number
      readonly connected: boolean
    }
  | { readonly kind: 'surrender'; readonly who: number }
  | { readonly kind: 'rematch'; readonly same: boolean }
  | { readonly kind: 'leave'; readonly who: number }

const who = fc.integer({ min: 0, max: HUMANS.length - 1 })
const stepArb: fc.Arbitrary<Step> = fc.oneof(
  {
    arbitrary: fc.record({
      kind: fc.constant('advance' as const),
      ms: fc.integer({ min: 0, max: 25_000 }),
    }),
    weight: 4,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('select' as const),
      who,
      option: fc.nat(4),
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('replace' as const),
      who,
      option: fc.nat(4),
      seen: fc.boolean(),
    }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('guess' as const),
      who,
      mode: fc.constantFrom(
        'wrong' as const,
        'correct' as const,
        'close' as const,
      ),
    }),
    weight: 4,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('hint' as const),
      who,
      approve: fc.boolean(),
    }),
    weight: 1,
  },
  {
    arbitrary: fc.record({ kind: fc.constant('draw' as const), who }),
    weight: 2,
  },
  {
    arbitrary: fc.record({ kind: fc.constant('continue' as const) }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('presence' as const),
      who,
      connected: fc.boolean(),
    }),
    weight: 1,
  },
  {
    arbitrary: fc.record({ kind: fc.constant('surrender' as const), who }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('rematch' as const),
      same: fc.boolean(),
    }),
    weight: 1,
  },
  {
    // Leaving mid-turn hands the drawing to a teammate.
    arbitrary: fc.record({ kind: fc.constant('leave' as const), who }),
    weight: 1,
  },
)

function teamOf(state: RoomState, memberId: string): TeamId | null {
  return state.members.find((member) => member.id === memberId)?.team ?? null
}

/** The live answer for the member's team, if they could be guessing it. */
function liveTerm(state: RoomState, team: TeamId): string | null {
  const match = state.match
  if (state.phase === 'drawing' && match?.round) {
    const teamRound = match.round.teams[team]
    return (
      teamRound.options.find(
        (option) => option.wordId === teamRound.chosenWordId,
      )?.term ?? null
    )
  }
  if (state.phase === 'showdown' && match?.showdown) {
    const teamState = match.showdown.teams[team]
    return teamState.cards[teamState.cardIndex]?.term ?? null
  }
  return null
}

function toCommand(
  driver: RoomDriver,
  step: Step,
  serial: number,
): RoomCommand | null {
  const state = driver.state
  switch (step.kind) {
    case 'advance':
      return null
    case 'select':
    case 'replace': {
      const actorId = HUMANS[step.who]!
      const team = teamOf(state, actorId)
      const options =
        team === null ? [] : (state.match?.round?.teams[team].options ?? [])
      const wordId =
        options[step.option % Math.max(1, options.length)]?.wordId ?? 'none'
      return step.kind === 'select'
        ? { type: 'draft.select', actorId, wordId }
        : {
            type: 'draft.replace',
            actorId,
            wordId,
            reason: step.seen ? 'seen-before' : 'unknown-definition',
          }
    }
    case 'guess': {
      const actorId = HUMANS[step.who]!
      const team = teamOf(state, actorId)
      const term = team === null ? null : liveTerm(state, team)
      const text =
        step.mode === 'wrong' || term === null
          ? `${actorId} says ${serial}`
          : step.mode === 'correct'
            ? term
            : `${term.slice(0, -1)}${term.endsWith('a') ? 'e' : 'a'}`
      return { type: 'guess.submit', actorId, text }
    }
    case 'hint':
      return {
        type: 'hint.vote',
        actorId: HUMANS[step.who]!,
        approve: step.approve,
      }
    case 'draw': {
      const id = `s${serial}`
      return {
        type: 'drawing.ops',
        actorId: HUMANS[step.who]!,
        ops: [
          {
            type: 'stroke.begin',
            strokeId: id,
            point: { x: 0.5, y: 0.5 },
            style: { color: '#000000', width: 0.01, opacity: 1 },
          },
          { type: 'stroke.end', strokeId: id, pointCount: 1 },
        ],
      }
    }
    case 'continue':
      return { type: 'round.continue', actorId: state.hostId ?? 'ana' }
    case 'presence':
      return {
        type: 'member.presence',
        memberId: HUMANS[step.who]!,
        connected: step.connected,
      }
    case 'surrender':
      return {
        type: 'surrender.vote',
        actorId: HUMANS[step.who]!,
        approve: true,
      }
    case 'rematch':
      return {
        type: 'match.rematch',
        actorId: state.hostId ?? 'ana',
        mode: step.same ? 'same-settings' : 'change-settings',
      }
    case 'leave':
      return { type: 'member.leave', memberId: HUMANS[step.who]! }
  }
}

interface Found {
  readonly strings: Set<string>
  readonly definitionPaths: string[]
}

/** Every string in the view (settings excluded) plus where definitions sit. */
function collect(view: RoomView): Found {
  const strings = new Set<string>()
  const definitionPaths: string[] = []
  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      strings.add(value.toLowerCase())
      if (path.endsWith('.definition')) definitionPaths.push(path)
      return
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`))
      return
    }
    if (typeof value === 'object' && value !== null) {
      for (const [key, entry] of Object.entries(value)) {
        if (path === '' && key === 'settings') continue
        walk(entry, `${path}.${key}`)
      }
    }
  }
  walk(view, '')
  return { strings, definitionPaths }
}

/**
 * Word ids a viewer may see now: the drawer's own cards during their live
 * round, and the chosen words of finished rounds (results and final).
 */
function allowedWordIds(
  state: RoomState,
  viewerId: string | null,
): Set<string> {
  const allowed = new Set<string>()
  const match = state.match
  if (match === null || state.phase === 'lobby') return allowed
  const member = state.members.find(
    (entry) => entry.id === viewerId && entry.left !== true,
  )
  const round = match.round
  const live = state.phase === 'word-draft' || state.phase === 'drawing'
  if (live && round !== null && member !== undefined) {
    const teamRound = round.teams[member.team]
    if (teamRound.drawerId === member.id) {
      for (const option of teamRound.options) allowed.add(option.wordId)
    }
  }
  const revealed =
    state.phase === 'round-results' && round !== null
      ? [round]
      : state.phase === 'stats'
        ? match.history
        : []
  for (const entry of revealed) {
    for (const team of ['A', 'B'] as const) {
      const chosen = entry.teams[team].chosenWordId
      if (chosen !== null) allowed.add(chosen)
    }
  }
  return allowed
}

/** Every word id the state could mention: the pool plus offered cards. */
function knownWordIds(state: RoomState): Set<string> {
  const ids = new Set(roomPool(state.settings).map((word) => word.id))
  const match = state.match
  for (const round of [...(match?.history ?? []), match?.round ?? null]) {
    if (round === null) continue
    for (const team of ['A', 'B'] as const) {
      for (const option of round.teams[team].options) ids.add(option.wordId)
    }
  }
  return ids
}

interface Snapshot {
  readonly viewerId: string | null
  readonly view: RoomView
  readonly found: Found
}

/** Each viewer's projection, computed once per check. */
function snapshots(driver: RoomDriver): Snapshot[] {
  return [...HUMANS, null].map((viewerId) => {
    const view = driver.view(viewerId)
    return { viewerId, view, found: collect(view) }
  })
}

function checkWordIds(state: RoomState, views: readonly Snapshot[]): void {
  const known = knownWordIds(state)
  for (const { viewerId, view, found } of views) {
    const allowed = allowedWordIds(state, viewerId)
    const visible = [...found.strings].filter((text) => known.has(text))
    expect(visible.filter((id) => !allowed.has(id))).toEqual([])
    const round = state.match?.round
    if (state.phase === 'round-results' && round) {
      for (const team of ['A', 'B'] as const) {
        expect(view.results?.teams[team].wordId).toBe(
          round.teams[team].chosenWordId,
        )
      }
    }
    if (state.phase === 'stats' && state.match) {
      expect(
        view.final?.rounds.map((entry) => [
          entry.teams.A.wordId,
          entry.teams.B.wordId,
        ]),
      ).toEqual(
        state.match.history.map((entry) => [
          entry.teams.A.chosenWordId,
          entry.teams.B.chosenWordId,
        ]),
      )
    }
  }
}

function checkSecrecy(driver: RoomDriver): void {
  const state = driver.state
  const views = snapshots(driver)
  checkWordIds(state, views)
  const match = state.match
  const visibility = state.settings.opponentDraftVisibility
  const live = state.phase === 'word-draft' || state.phase === 'drawing'
  const round = live ? (match?.round ?? null) : null
  const teamTerms = (team: TeamId): string[] =>
    round === null
      ? []
      : round.teams[team].options.map((option) => option.term.toLowerCase())
  const teamGuessTexts = (team: TeamId): string[] => {
    if (round !== null)
      return round.teams[team].guesses.map((guess) => guess.text.toLowerCase())
    if (state.phase === 'showdown' && match?.showdown) {
      return match.showdown.teams[team].guesses.map((guess) =>
        guess.text.toLowerCase(),
      )
    }
    return []
  }

  for (const { viewerId, view, found } of views) {
    const { strings, definitionPaths } = found
    const member =
      viewerId === null
        ? undefined
        : state.members.find(
            (entry) => entry.id === viewerId && entry.left !== true,
          )
    const leaked = (terms: readonly string[]) =>
      terms.filter((term) => strings.has(term))

    if (member === undefined) {
      if (round !== null) {
        expect(leaked([...teamTerms('A'), ...teamTerms('B')])).toEqual([])
      }
      expect(definitionPaths.filter(() => round !== null)).toEqual([])
      expect(leaked([...teamGuessTexts('A'), ...teamGuessTexts('B')])).toEqual(
        [],
      )
      continue
    }

    const own = member.team
    const opponent = otherTeam(own)
    const isDrawer =
      (round !== null && round.teams[own].drawerId === member.id) ||
      (state.phase === 'showdown' &&
        match?.showdown?.teams[own].drawerId === member.id)

    // Guess texts never cross teams; correct guesses are never echoed.
    expect(leaked(teamGuessTexts(opponent))).toEqual([])
    const myGuesses =
      view.round?.mine?.guesses ?? view.showdown?.mine?.guesses ?? []
    for (const guess of myGuesses) {
      if (guess.verdict === 'correct') expect(guess.text).toBeNull()
    }

    if (round !== null) {
      if (!isDrawer) {
        expect(leaked(teamTerms(own))).toEqual([])
        expect(definitionPaths).toEqual([])
        const mine = view.round?.mine
        const shown =
          state.phase === 'drawing' &&
          (state.settings.wordLengthMode === 'shown' ||
            round.teams[own].hint.revealed)
        if (!shown) {
          expect(mine?.pattern ?? null).toBeNull()
          expect(mine?.letterCount ?? null).toBeNull()
        }
      } else {
        expect(
          definitionPaths.every((path) => path.startsWith('.round.mine.')),
        ).toBe(true)
      }
      const opponentVisible =
        state.phase === 'word-draft' && visibility === 'options-and-actions'
      if (!opponentVisible) expect(leaked(teamTerms(opponent))).toEqual([])
      const actions = view.round?.opponent?.actions ?? null
      if (state.phase !== 'word-draft' || visibility === 'hidden')
        expect(actions).toBeNull()
      if (
        state.phase !== 'word-draft' ||
        visibility !== 'options-and-actions'
      ) {
        expect(view.round?.opponent?.options ?? null).toBeNull()
      }
    }

    if (state.phase === 'showdown' && !isDrawer) {
      const term = liveTerm(state, own)
      if (term !== null) expect(strings.has(term.toLowerCase())).toBe(false)
    }
  }
}

function setupRoom(
  seed: number,
  visibility: OpponentDraftVisibility,
  lengthMode: WordLengthMode,
): RoomDriver {
  const driver = new RoomDriver({ seed })
  driver.join('ana', 'Ana', { team: 'A' })
  driver.join('ben', 'Ben', { team: 'A' })
  driver.join('cy', 'Cy', { team: 'B' })
  driver.join('di', 'Di', { team: 'B' })
  driver.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'A' })
  driver.settings('ana', {
    rounds: 2,
    customWordsMode: 'only',
    customWords: customWordList(40),
    packIds: [],
    opponentDraftVisibility: visibility,
    wordLengthMode: lengthMode,
    hintUnlockSeconds: 5,
    replacementsPerDrawer: 2,
    showdownSeconds: 60,
  })
  driver.readyAll()
  driver.ok({ type: 'match.start', actorId: 'ana' })
  return driver
}

// 120 random matches, each projected for every viewer after every step: about
// a second on an idle machine, several times that while `pnpm check` runs
// builds and other suites on the same cores, so it gets its own budget.
const PROPERTY_TIMEOUT_MS = 30_000

describe('projection secrecy (property)', () => {
  it(
    'never leaks own words, word ids, definitions, opponent cards, or guesses',
    { timeout: PROPERTY_TIMEOUT_MS },
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 2 ** 31 - 1 }),
          fc.constantFrom<OpponentDraftVisibility>(
            'options-and-actions',
            'actions-only',
            'hidden',
          ),
          fc.constantFrom<WordLengthMode>('hidden-vote', 'shown', 'hidden'),
          fc.array(stepArb, { minLength: 10, maxLength: 70 }),
          (seed, visibility, lengthMode, steps) => {
            const driver = setupRoom(seed, visibility, lengthMode)
            checkSecrecy(driver)
            steps.forEach((step, serial) => {
              if (step.kind === 'advance') driver.advanceBy(step.ms)
              else {
                driver.now += 450
                const command = toCommand(driver, step, serial)
                if (command !== null) driver.run(command)
              }
              checkSecrecy(driver)
            })
          },
        ),
        { numRuns: 120 },
      )
    },
  )

  it('shows opponents cards only during the draft as visibility allows', () => {
    for (const visibility of [
      'options-and-actions',
      'actions-only',
      'hidden',
    ] as const) {
      const driver = setupRoom(4, visibility, 'hidden-vote')
      const option = driver.teamRound('B').options[0]!
      driver.ok({
        type: 'draft.replace',
        actorId: 'cy',
        wordId: option.wordId,
        reason: 'seen-before',
      })
      const opponent = driver.view('ben').round?.opponent
      expect(opponent?.options === null).toBe(
        visibility !== 'options-and-actions',
      )
      expect(opponent?.actions).toEqual(
        visibility === 'hidden' ? null : [{ reason: 'seen-before' }],
      )
      if (visibility === 'options-and-actions') {
        expect(opponent?.options).toEqual(
          driver.teamRound('B').options.map((entry) => ({
            term: entry.term,
            difficulty: entry.difficulty,
          })),
        )
      }
      expect(driver.view('di').round?.mine?.options).toBeNull()
      expect(driver.view(null).round?.opponent?.options).toBeNull()
      driver.pickWords()
      expect(driver.view('ben').round?.opponent).toMatchObject({
        options: null,
        actions: null,
      })
    }
  })
})
