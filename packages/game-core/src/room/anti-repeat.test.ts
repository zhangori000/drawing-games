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

  it('relaxes gracefully on a tiny pool, bringing back the oldest words', () => {
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
    const dealt: string[][] = []
    let lastRound = 0
    while (driver.state.phase !== 'stats') {
      const round = driver.state.match?.round
      if (driver.state.phase === 'word-draft' && round!.number !== lastRound) {
        lastRound = round!.number
        dealt.push(round!.teams.B.options.map((option) => option.wordId))
      }
      if (driver.state.phase === 'word-draft') driver.pickWords()
      else driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    }
    log.checkedDrafts = dealt.length
    expect(log.checkedDrafts).toBe(6)
    const all = chosenWordsOf(driver)
    expect(all).toHaveLength(12)
    // Rounds 1–3 and Sun's round-4 card use 7 different words. In round 4
    // the only never-drawn word left is on Sun's hand, so Moon gets the two
    // least recently drawn words (round 1's) back.
    expect(new Set(all.slice(0, 7)).size).toBe(7)
    expect([...dealt[3]!].sort()).toEqual([...all.slice(0, 2)].sort())
    // Round 5 hands Sun that last never-drawn word, so all 8 get drawn.
    expect(new Set(all.slice(0, 10)).size).toBe(8)
  })

  it('never repeats 16 custom words over 6 rounds, whatever card is picked', () => {
    for (const pick of ['first', 'last'] as const) {
      const driver = room({
        rounds: 6,
        showdown: false,
        customWordsMode: 'only',
        customWords: customWordList(16),
        packIds: [],
      })
      expect(driver.state.settings.wordChoiceCount).toBe(3)
      while (driver.state.phase !== 'stats') {
        if (driver.state.phase === 'word-draft') {
          for (const team of ['A', 'B'] as const) {
            const teamRound = driver.teamRound(team)
            if (teamRound.chosenWordId !== null) continue
            const options = driver.view(teamRound.drawerId).round!.mine!
              .options!
            // Every card dealt this match is one the room never drew.
            expect(options.filter((option) => option.drawnBefore)).toEqual([])
            driver.ok({
              type: 'draft.select',
              actorId: teamRound.drawerId,
              wordId: (pick === 'first' ? options[0] : options.at(-1))!.wordId,
            })
          }
        } else {
          driver.advanceTo(driver.state.phaseDeadlineAtMs!)
        }
      }
      const all = chosenWordsOf(driver)
      expect(all).toHaveLength(12)
      expect(new Set(all).size).toBe(12)
    }
  })

  it('deals a drawn word only when nothing fresh is left, and marks it', () => {
    // Six words, three cards: round 2 has four never-drawn words for six
    // cards, so Moon's hand mixes one fresh word with two drawn ones.
    const driver = room({
      rounds: 2,
      showdown: false,
      customWordsMode: 'only',
      customWords: customWordList(6),
      packIds: [],
    })
    driver.pickWords()
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.state.match!.round!.number).toBe(2)
    const drawn = new Set(chosenWordsOf(driver))
    expect(drawn.size).toBe(2)
    const sun = driver.view(driver.drawer('A')).round!.mine!.options!
    expect(sun.map((option) => option.drawnBefore)).toEqual([
      false,
      false,
      false,
    ])
    const moon = driver.view(driver.drawer('B')).round!.mine!.options!
    expect(moon.map((option) => option.drawnBefore)).toEqual([
      false,
      true,
      true,
    ])
    for (const option of moon) {
      expect(drawn.has(option.wordId)).toBe(option.drawnBefore)
    }
  })

  it('a bot drawer or the draft deadline picks a never-drawn card when there is one', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const who of ['bot', 'deadline'] as const) {
        const driver = new RoomDriver({ seed })
        driver.join('ana', 'Ana', { team: 'A' })
        driver.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'A' })
        driver.join('cy', 'Cy', { team: 'B' })
        if (who === 'bot') {
          driver.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'B' })
        } else {
          driver.join('di', 'Di', { team: 'B' })
        }
        driver.settings('ana', {
          rounds: 4,
          showdown: false,
          customWordsMode: 'only',
          customWords: customWordList(6),
          packIds: [],
        })
        driver.readyAll()
        driver.ok({ type: 'match.start', actorId: 'ana' })
        while (driver.state.phase !== 'stats') {
          if (driver.state.phase === 'word-draft') {
            const moon = driver.teamRound('B')
            const drawer = driver.state.members.find(
              (member) => member.id === moon.drawerId,
            )!
            const drawn = new Set(driver.state.wordMemory.usedWordIds)
            const fresh = moon.options.filter((o) => !drawn.has(o.wordId))
            // Sun picks by hand; Moon is left to its bot or the deadline.
            if (driver.teamRound('A').chosenWordId === null) {
              driver.ok({
                type: 'draft.select',
                actorId: driver.drawer('A'),
                wordId: driver.teamRound('A').options[0]!.wordId,
              })
            }
            if (drawer.kind === 'human' || who === 'bot') {
              driver.advanceTo(driver.state.phaseDeadlineAtMs!)
            }
            if (driver.state.phase === 'word-draft') {
              driver.advanceTo(driver.state.phaseDeadlineAtMs!)
            }
            const chosen = driver.teamRound('B').chosenWordId!
            if (fresh.length > 0) expect(drawn.has(chosen)).toBe(false)
          } else {
            driver.advanceTo(driver.state.phaseDeadlineAtMs!)
          }
        }
      }
    }
  })

  it('warns in the lobby from which round a small list must repeat', () => {
    const driver = new RoomDriver({ seed: 3 })
    driver.join('ana', 'Ana', { team: 'A' })
    driver.join('ben', 'Ben', { team: 'A' })
    driver.join('cy', 'Cy', { team: 'B' })
    driver.join('di', 'Di', { team: 'B' })
    const lobby = () => driver.view('ben').lobby!
    // Default packs: plenty of fresh words.
    expect(lobby().repeatsFromRound).toBeNull()
    driver.settings('ana', {
      rounds: 6,
      showdown: false,
      customWordsMode: 'only',
      customWords: customWordList(16),
      packIds: [],
    })
    // 16 words; a round may deal 2 × (3 cards + 1 swap) = 8, and each round
    // draws 2: rounds 1–5 always have 8 fresh words, round 6 has 6.
    expect(lobby()).toMatchObject({ unusedWordCount: 16, repeatsFromRound: 6 })
    driver.settings('ana', { rounds: 4 })
    expect(lobby().repeatsFromRound).toBeNull()
    driver.settings('ana', { customWords: customWordList(7), rounds: 2 })
    expect(lobby().repeatsFromRound).toBe(1)
    // After a match, the room's drawn words count against the next one.
    driver.settings('ana', { customWords: customWordList(18), rounds: 2 })
    expect(lobby().repeatsFromRound).toBeNull()
    driver.readyAll()
    driver.ok({ type: 'match.start', actorId: 'ana' })
    while (driver.state.phase !== 'stats') {
      if (driver.state.phase === 'word-draft') driver.pickWords()
      else driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    }
    driver.ok({
      type: 'match.rematch',
      actorId: 'ana',
      mode: 'change-settings',
    })
    expect(lobby()).toMatchObject({ unusedWordCount: 14 })
    driver.settings('ana', { rounds: 6 })
    // 14 fresh: round 4 has 8, round 5 only 6.
    expect(lobby().repeatsFromRound).toBe(5)
  })
})
