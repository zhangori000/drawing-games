import { wordPattern } from '@drawing-games/word-bank'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type { OpponentDraftVisibility } from '../settings'
import { otherTeam, type TeamId } from '../types'
import {
  DEFAULT_ROOM_SETTINGS,
  type DifficultyMix,
  type RoomSettings,
  type WordLengthMode,
} from './settings'
import { RoomDriver } from './test-driver'
import type { RoomView } from './types'

/**
 * Sun: Ana, Ben, Gil. Moon: Cy, Di. Curated default packs, so cards differ
 * in difficulty, pack, and length: the clues that could tell them apart.
 */
function startRoom(seed: number, patch: Partial<RoomSettings> = {}) {
  const driver = new RoomDriver({ seed })
  driver.join('ana', 'Ana', { team: 'A' })
  driver.join('ben', 'Ben', { team: 'A' })
  driver.join('gil', 'Gil', { team: 'A' })
  driver.join('cy', 'Cy', { team: 'B' })
  driver.join('di', 'Di', { team: 'B' })
  if (Object.keys(patch).length > 0) driver.settings('ana', patch)
  driver.readyAll()
  driver.ok({ type: 'match.start', actorId: 'ana' })
  return driver
}

function sunGuessers(driver: RoomDriver): string[] {
  const drawer = driver.drawer('A')
  return ['ana', 'ben', 'gil'].filter((id) => id !== drawer)
}

describe('opponent draft visibility', () => {
  it('defaults to swaps only, so guessers keep every clue', () => {
    expect(DEFAULT_ROOM_SETTINGS.opponentDraftVisibility).toBe('actions-only')
    const driver = startRoom(3)
    expect(driver.view('cy').round?.opponent?.options).toBeNull()
    expect(driver.view('cy').round?.opponent?.actions).toEqual([])
    driver.pickWords()
    const [guesser] = sunGuessers(driver)
    const mine = driver.view(guesser!).round!.mine!
    const chosen = driver
      .teamRound('A')
      .options.find(
        (option) => option.wordId === driver.teamRound('A').chosenWordId,
      )!
    expect(mine.difficulty).toBe(chosen.difficulty)
    expect(mine.category).toBe(chosen.packName)
    expect(mine.hint.mode).toBe('hidden-vote')
  })

  it('with cards shown, guessers get no clue that points at one card', () => {
    const driver = startRoom(8, {
      opponentDraftVisibility: 'options-and-actions',
      wordLengthMode: 'shown',
      categoryHint: true,
    })
    // Moon sees Sun's cards during the draft...
    expect(driver.view('cy').round?.opponent?.options).toHaveLength(3)
    const [guesser] = sunGuessers(driver)
    driver.ok({
      type: 'draft.select',
      actorId: driver.drawer('A'),
      wordId: driver.teamRound('A').options[2]!.wordId,
    })
    // ...so Sun's guessers learn nothing about which card was picked.
    expect(driver.view(guesser!).round?.mine).toMatchObject({
      chosen: true,
      difficulty: null,
      category: null,
    })
    driver.pickWords()
    expect(driver.state.phase).toBe('drawing')
    const mine = driver.view(guesser!).round!.mine!
    expect(mine).toMatchObject({
      difficulty: null,
      category: null,
      pattern: null,
      letterCount: null,
    })
    expect(mine.hint.mode).toBe('hidden')
    expect(mine.hint.cost).toBe(0)
    // The drawer still sees their word and its stake.
    const drawerView = driver.view(driver.drawer('A')).round!.mine!
    expect(drawerView.word?.difficulty).toBe(
      driver.teamRound('A').options[2]!.difficulty,
    )
    expect(drawerView.difficulty).toBe(drawerView.word?.difficulty)
    // Results still show the word, its difficulty, and its category.
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    const result = driver.view(guesser!).results!.teams.A
    expect(result.difficulty).toBe(driver.teamRound('A').options[2]!.difficulty)
    expect(result.packName).toBe(driver.teamRound('A').options[2]!.packName)
  })

  it('with cards shown, there is no length vote to buy the pattern', () => {
    const driver = startRoom(9, {
      opponentDraftVisibility: 'options-and-actions',
      wordLengthMode: 'hidden-vote',
      hintUnlockSeconds: 0,
    })
    driver.pickWords()
    const [guesser] = sunGuessers(driver)
    const error = driver.fail({
      type: 'hint.vote',
      actorId: guesser!,
      approve: true,
    })
    expect(error.code).toBe('NOT_ALLOWED')
    expect(driver.teamRound('A').hint.revealed).toBe(false)
  })

  it('never shows the cards to someone who joined after they were dealt', () => {
    const driver = startRoom(4, {
      opponentDraftVisibility: 'options-and-actions',
    })
    driver.now += 1000
    driver.join('spy', 'Gina 2', { team: 'B' })
    expect(driver.view('spy').round?.opponent?.options).toBeNull()
    expect(driver.view('spy').round?.opponent?.actions).toEqual([])
    expect(driver.view('cy').round?.opponent?.options).toHaveLength(3)
    // From the next draft on, the newcomer is an ordinary Moon member.
    driver.pickWords()
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.state.phase).toBe('word-draft')
    expect(driver.view('spy').round?.opponent?.options).toHaveLength(3)
  })
})

/** What a pair of seats on opposite teams has learned about one team's word. */
interface Knowledge {
  /** Cards the other team's seats saw, by term. */
  readonly candidates: Map<string, { difficulty: string; packName: string }>
  difficulty: string | null
  category: string | null
  pattern: string | null
}

const POSSIBLE_TEAMS: readonly TeamId[] = ['A', 'B']

describe('opponent draft visibility (property)', () => {
  it(
    'two seats on opposite teams never narrow a word down to one card',
    { timeout: 30_000 },
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
          fc.boolean(),
          fc.constantFrom<DifficultyMix>('balanced', 'mixed', 'easy', 'hard'),
          fc.array(fc.nat(9), { minLength: 12, maxLength: 12 }),
          (seed, visibility, lengthMode, categoryHint, mix, choices) => {
            const driver = startRoom(seed, {
              rounds: 2,
              showdown: false,
              opponentDraftVisibility: visibility,
              wordLengthMode: lengthMode,
              categoryHint,
              difficultyMix: mix,
              hintUnlockSeconds: 0,
              replacementsPerDrawer: 2,
            })
            let choice = 0
            const next = () => choices[choice++ % choices.length]!
            const viewers = () =>
              driver.state.members
                .filter((member) => member.kind === 'human' && !member.left)
                .map((member) => member.id)
            // A spy joins Moon during the first draft.
            const spyAt = next() % 3

            for (let round = 1; round <= 2; round += 1) {
              expect(driver.state.phase).toBe('word-draft')
              const knowledge: Record<TeamId, Knowledge> = {
                A: fresh(),
                B: fresh(),
              }
              const observe = () => {
                for (const id of viewers()) {
                  learn(driver.view(id), id, knowledge, driver)
                }
              }
              for (let step = 0; step < 3; step += 1) {
                if (round === 1 && step === spyAt) {
                  driver.now += 300
                  driver.join('spy', 'Spy', { team: 'B' })
                }
                observe()
                for (const team of POSSIBLE_TEAMS) {
                  const teamRound = driver.teamRound(team)
                  if (teamRound.chosenWordId !== null) continue
                  const option =
                    teamRound.options[next() % teamRound.options.length]!
                  driver.now += 300
                  driver.run(
                    next() % 3 === 0
                      ? {
                          type: 'draft.replace',
                          actorId: teamRound.drawerId,
                          wordId: option.wordId,
                          reason: 'seen-before',
                        }
                      : {
                          type: 'draft.select',
                          actorId: teamRound.drawerId,
                          wordId: option.wordId,
                        },
                  )
                  if (driver.state.phase !== 'word-draft') break
                }
                if (driver.state.phase !== 'word-draft') break
              }
              observe()
              if (driver.state.phase === 'word-draft') {
                driver.advanceTo(driver.state.phaseDeadlineAtMs!)
              }
              expect(driver.state.phase).toBe('drawing')
              observe()
              // Every guesser votes for the letters, if the room has a vote.
              driver.now += 1000
              for (const id of viewers()) {
                const mine = driver.view(id).round?.mine
                if (mine?.hint.canVote) {
                  driver.run({ type: 'hint.vote', actorId: id, approve: true })
                }
              }
              observe()
              driver.advanceBy(20_000)
              observe()

              for (const team of POSSIBLE_TEAMS) {
                const known = knowledge[team]
                if (known.candidates.size === 0) continue
                const matching = [...known.candidates].filter(
                  ([term, card]) =>
                    (known.difficulty === null ||
                      card.difficulty === known.difficulty) &&
                    (known.category === null ||
                      card.packName === known.category) &&
                    (known.pattern === null ||
                      wordPattern(term) === known.pattern),
                )
                expect(
                  matching.length,
                  `team ${team} round ${round}: ${JSON.stringify({ ...known, candidates: [...known.candidates.keys()] })}`,
                ).toBeGreaterThanOrEqual(2)
              }
              driver.advanceTo(driver.state.phaseDeadlineAtMs!)
              expect(driver.state.phase).toBe('round-results')
              driver.advanceTo(driver.state.phaseDeadlineAtMs!)
            }
            expect(driver.state.phase).toBe('stats')
          },
        ),
        { numRuns: 40 },
      )
    },
  )
})

function fresh(): Knowledge {
  return {
    candidates: new Map(),
    difficulty: null,
    category: null,
    pattern: null,
  }
}

/**
 * Pools what one seat sees: cards of the other team (with their pack,
 * which anyone can look up in the public catalog) and clues about the
 * seat's own team's word when it is guessing.
 */
function learn(
  view: RoomView,
  viewerId: string,
  knowledge: Record<TeamId, Knowledge>,
  driver: RoomDriver,
): void {
  const round = view.round
  const me = view.me
  if (round === null || me === null) return
  const opponentTeam = otherTeam(me.team)
  for (const card of round.opponent?.options ?? []) {
    const option = driver
      .teamRound(opponentTeam)
      .options.find((entry) => entry.term === card.term)
    knowledge[opponentTeam].candidates.set(card.term, {
      difficulty: card.difficulty,
      packName: option?.packName ?? '',
    })
  }
  const mine = round.mine
  if (mine === null || mine.amDrawer || mine.drawerId === viewerId) return
  const own = knowledge[me.team]
  own.difficulty ??= mine.difficulty
  own.category ??= mine.category
  own.pattern ??= mine.pattern
}
