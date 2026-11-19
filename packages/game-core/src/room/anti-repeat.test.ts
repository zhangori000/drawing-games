import { getAllPlayableWords } from '@drawing-games/word-bank'
import { describe, expect, it } from 'vitest'

import type { RoomSettings } from './settings'
import { customWordList, RoomDriver } from './test-driver'
import { roomPool } from './words'

interface DraftLog {
  checkedDrafts: number
}

/**
 * Plays every round with the given drawer behavior and checks, at each
 * draft, that the teams never share cards and no drawer is offered a word
 * from their avoid memory.
 */
function playMatch(driver: RoomDriver, log: DraftLog): void {
  let lastRound = 0
  while (driver.state.phase !== 'stats') {
    if (driver.state.phase === 'word-draft') {
      const round = driver.state.match!.round!
      if (round.number !== lastRound) {
        lastRound = round.number
        const a = round.teams.A.options.map((option) => option.wordId)
        const b = round.teams.B.options.map((option) => option.wordId)
        expect(a.filter((id) => b.includes(id))).toEqual([])
        for (const team of ['A', 'B'] as const) {
          const teamRound = round.teams[team]
          const drawer = driver.state.members.find(
            (member) => member.id === teamRound.drawerId,
          )!
          const avoided = new Set(drawer.memory.avoid)
          expect(
            teamRound.options.filter((option) => avoided.has(option.wordId)),
          ).toEqual([])
        }
        log.checkedDrafts += 1
      }
      driver.pickWords()
    } else {
      driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    }
  }
}

function room(
  settings: Partial<RoomSettings>,
  memory?: (index: number) => string[],
): RoomDriver {
  const driver = new RoomDriver({ seed: 99 })
  const names = ['Ana', 'Ben', 'Cy', 'Di']
  names.forEach((name, index) => {
    driver.join(name.toLowerCase(), name, {
      team: index < 2 ? 'A' : 'B',
      memory: { avoid: memory?.(index) ?? [], soft: [] },
    })
  })
  driver.settings('ana', settings)
  driver.readyAll()
  driver.ok({ type: 'match.start', actorId: 'ana' })
  return driver
}

function chosenWordsOf(driver: RoomDriver): string[] {
  return driver.state.match!.history.flatMap((round) => [
    round.teams.A.chosenWordId!,
    round.teams.B.chosenWordId!,
  ])
}

describe('anti-repeat word memory', () => {
  it('never repeats a chosen word across 8 rounds and a rematch (custom pool)', () => {
    const words = customWordList(80)
    const pool = words.map((word) => `custom/${word}`)
    const driver = room(
      {
        rounds: 8,
        showdown: false,
        customWordsMode: 'only',
        customWords: words,
        packIds: [],
      },
      // Each player has already drawn a different slice of the pool.
      (index) => pool.slice(index * 10, index * 10 + 10),
    )
    const log: DraftLog = { checkedDrafts: 0 }
    playMatch(driver, log)
    const first = chosenWordsOf(driver)
    driver.ok({ type: 'match.rematch', actorId: 'ana', mode: 'same-settings' })
    playMatch(driver, log)
    const all = [...first, ...chosenWordsOf(driver)]
    expect(all).toHaveLength(32)
    expect(new Set(all).size).toBe(32)
    expect(log.checkedDrafts).toBe(16)
    expect(driver.state.wordMemory.usedWordIds).toEqual(all)
  })

  it('never repeats with the default curated packs either', () => {
    const driver = room({ rounds: 8, showdown: false })
    const poolSize = roomPool(driver.state.settings).length
    const log: DraftLog = { checkedDrafts: 0 }
    playMatch(driver, log)
    const first = chosenWordsOf(driver)
    driver.ok({ type: 'match.rematch', actorId: 'ana', mode: 'same-settings' })
    playMatch(driver, log)
    const all = [...first, ...chosenWordsOf(driver)]
    if (poolSize >= all.length + 12) expect(new Set(all).size).toBe(all.length)
  })

  it('deals one easy, one medium, and one hard card by default', () => {
    const driver = room({ rounds: 8, showdown: false })
    const pool = roomPool(driver.state.settings)
    const hasEach = ['easy', 'medium', 'hard'].every((difficulty) =>
      pool.some((word) => word.difficulty === difficulty),
    )
    expect(hasEach).toBe(true)
    while (driver.state.phase !== 'stats') {
      if (driver.state.phase === 'word-draft') {
        for (const team of ['A', 'B'] as const) {
          expect(
            driver.teamRound(team).options.map((option) => option.difficulty),
          ).toEqual(['easy', 'medium', 'hard'])
          expect(
            driver
              .view(driver.drawer(team))
              .round?.mine?.options?.map((o) => o.bonus),
          ).toEqual([0, 20, 40])
        }
        driver.pickWords()
      } else {
        driver.advanceTo(driver.state.phaseDeadlineAtMs!)
      }
    }
  })

  it('never offers the drawer avoid memory from an account, even when most of the pool', () => {
    const curated = getAllPlayableWords()
    const driver = room({ rounds: 4, showdown: false }, (index) =>
      index === 0
        ? curated
            .filter((_, wordIndex) => wordIndex % 3 !== 0)
            .map((word) => word.id)
        : [],
    )
    const log: DraftLog = { checkedDrafts: 0 }
    playMatch(driver, log)
    expect(log.checkedDrafts).toBe(4)
  })

  it('does not offer replaced words or the other team cards again in the round', () => {
    const words = customWordList(30)
    const driver = room({
      customWordsMode: 'only',
      customWords: words,
      packIds: [],
      replacementsPerDrawer: 5,
    })
    const replaced: string[] = []
    for (let swap = 0; swap < 5; swap += 1) {
      const option = driver.teamRound('A').options[0]!
      replaced.push(option.wordId)
      driver.ok({
        type: 'draft.replace',
        actorId: 'ana',
        wordId: option.wordId,
        reason: 'seen-before',
      })
      const live = driver.teamRound('A').options.map((entry) => entry.wordId)
      expect(live.filter((id) => replaced.includes(id))).toEqual([])
      const other = driver.teamRound('B').options.map((entry) => entry.wordId)
      expect(live.filter((id) => other.includes(id))).toEqual([])
    }
  })

  it('relaxes gracefully on a tiny pool instead of failing', () => {
    const words = customWordList(8)
    const driver = room({
      rounds: 6,
      showdown: false,
      customWordsMode: 'only',
      customWords: words,
      packIds: [],
      wordChoiceCount: 2,
    })
    const log: DraftLog = { checkedDrafts: 0 }
    playMatch(driver, log)
    expect(log.checkedDrafts).toBe(6)
    const all = chosenWordsOf(driver)
    expect(all).toHaveLength(12)
    // The first rounds stay fresh until the reserve is reached.
    expect(new Set(all.slice(0, 4)).size).toBe(4)
  })
})
