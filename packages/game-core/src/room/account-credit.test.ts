import { describe, expect, it } from 'vitest'

import { EMPTY_WORD_MEMORY } from './records'
import type { MatchSummaryRecord, WordHistoryEvent } from './records'
import { customWordList, RoomDriver } from './test-driver'
import type { RoomEffect, RoomPhase } from './types'

const ACCOUNT = 'cy-acct'

/** Where in the match the guest links their new account. */
type LinkPoint = RoomPhase | 'never'

function link(driver: RoomDriver, accountId: string | null = ACCOUNT): void {
  driver.ok({
    type: 'member.link-account',
    memberId: 'cy',
    accountId,
    memory: EMPTY_WORD_MEMORY,
  })
}

function setup(cyAccount: string | null): RoomDriver {
  const driver = new RoomDriver({ seed: 11 })
  driver.join('ana', 'Ana', { team: 'A' })
  driver.join('ben', 'Ben', { team: 'A' })
  driver.join('cy', 'Cy', { team: 'B', accountId: cyAccount })
  driver.join('di', 'Di', { team: 'B' })
  driver.settings('ana', {
    rounds: 2,
    showdown: true,
    showdownSeconds: 60,
    customWordsMode: 'only',
    customWords: customWordList(40),
    packIds: [],
  })
  driver.readyAll()
  driver.ok({ type: 'match.start', actorId: 'ana' })
  return driver
}

/**
 * A fixed two-round match with a showdown in which Cy draws, reports a
 * card, misses, and guesses; `linkAt` runs once when that phase is first
 * entered (`stats` = the final screen).
 */
function playMatch(driver: RoomDriver, linkAt: LinkPoint): void {
  let linked = false
  const maybeLink = () => {
    if (!linked && driver.state.phase === linkAt) {
      linked = true
      link(driver)
    }
  }
  for (let round = 1; round <= 2; round += 1) {
    maybeLink()
    if (round === 1) {
      // Cy draws first for B and reports a card as already seen.
      expect(driver.drawer('B')).toBe('cy')
      const card = driver.teamRound('B').options[0]!
      driver.ok({
        type: 'draft.replace',
        actorId: 'cy',
        wordId: card.wordId,
        reason: 'seen-before',
      })
    }
    driver.pickWords()
    maybeLink()
    // Only A solves, so Cy misses Di's word in round 2.
    driver.solve('A')
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.state.phase).toBe('round-results')
    maybeLink()
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
  }
  expect(driver.state.phase).toBe('showdown')
  maybeLink()
  // Relay: Cy draws B's first card, then guesses Di's.
  expect(driver.state.match!.showdown!.teams.B.drawerId).toBe('cy')
  driver.solve('B', 'di')
  driver.solve('B', 'cy')
  driver.advanceTo(driver.state.match!.showdown!.deadlineAtMs)
  expect(driver.state.phase).toBe('stats')
  maybeLink()
}

function accountEffects(effects: readonly RoomEffect[], accountId: string) {
  const words: WordHistoryEvent[] = []
  const summaries: MatchSummaryRecord[] = []
  for (const effect of effects) {
    if (effect.type === 'account.words' && effect.accountId === accountId) {
      words.push(...effect.events)
    }
    if (effect.type === 'account.match' && effect.accountId === accountId) {
      summaries.push(effect.summary)
    }
  }
  const key = (event: WordHistoryEvent) =>
    `${event.atMs}|${event.role}|${event.wordId}`
  words.sort((left, right) => key(left).localeCompare(key(right)))
  return { words, summaries }
}

/** What the account would have received had Cy been signed in all along. */
function controlRun() {
  const driver = setup(ACCOUNT)
  playMatch(driver, 'never')
  return accountEffects(driver.history, ACCOUNT)
}

describe('crediting a match to an account linked late', () => {
  const control = controlRun()

  it('covers every kind of word event in the control match', () => {
    expect(new Set(control.words.map((event) => event.role))).toEqual(
      new Set(['drew', 'offered', 'seen-report', 'guessed', 'missed']),
    )
    expect(control.words.some((event) => event.packId === 'custom')).toBe(true)
    expect(control.summaries).toHaveLength(1)
  })

  it.each<LinkPoint>([
    'stats',
    'showdown',
    'round-results',
    'word-draft',
    'drawing',
  ])('linking during %s credits the whole match exactly once', (linkAt) => {
    const driver = setup(null)
    playMatch(driver, linkAt)
    expect(driver.state.members.find((m) => m.id === 'cy')?.accountId).toBe(
      ACCOUNT,
    )
    expect(accountEffects(driver.history, ACCOUNT)).toEqual(control)
  })

  it('credits the final screen in one step: words, then the summary', () => {
    const driver = setup(null)
    playMatch(driver, 'never')
    expect(accountEffects(driver.history, ACCOUNT).words).toEqual([])
    link(driver)
    expect(driver.effects.map((effect) => effect.type)).toEqual([
      'account.words',
      'account.match',
    ])
    expect(accountEffects(driver.effects, ACCOUNT)).toEqual(control)
  })

  it('never credits the match twice, to the same or another account', () => {
    const driver = setup(null)
    playMatch(driver, 'stats')
    const accountOf = (effect: RoomEffect) =>
      'accountId' in effect ? effect.accountId : null
    link(driver)
    expect(driver.effects.map(accountOf)).toEqual([])
    link(driver, null)
    link(driver, 'other-acct')
    expect(driver.effects.map(accountOf)).toEqual([])
    link(driver, ACCOUNT)
    expect(driver.effects.map(accountOf)).toEqual([])
    expect(accountEffects(driver.history, ACCOUNT)).toEqual(control)
    expect(accountEffects(driver.history, 'other-acct').words).toEqual([])
  })

  it('never re-credits a member who had an account from the start', () => {
    const driver = setup(ACCOUNT)
    playMatch(driver, 'never')
    link(driver)
    link(driver, 'other-acct')
    expect(
      driver.effects.filter((effect) => effect.type.startsWith('account.')),
    ).toEqual([])
    expect(accountEffects(driver.history, ACCOUNT)).toEqual(control)
  })

  it('credits a newcomer only for the rounds they were there for', () => {
    const driver = setup(null)
    driver.pickWords()
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    // Round 2: Eve joins Team B, then the match plays out.
    driver.join('eve', 'Eve', { team: 'B' })
    const joinedAtMs = driver.now
    while (driver.state.phase !== 'stats') {
      if (driver.state.phase === 'word-draft') driver.pickWords()
      else driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    }
    driver.ok({
      type: 'member.link-account',
      memberId: 'eve',
      accountId: 'eve-acct',
      memory: EMPTY_WORD_MEMORY,
    })
    const { words, summaries } = accountEffects(driver.effects, 'eve-acct')
    expect(words.length).toBeGreaterThan(0)
    expect(words.every((event) => event.atMs > joinedAtMs)).toBe(true)
    expect(summaries).toEqual([
      expect.objectContaining({ matchNumber: 1, team: 'B', roundsPlayed: 2 }),
    ])
  })

  it('does not credit a finished match once the room is back in the lobby', () => {
    const driver = setup(null)
    playMatch(driver, 'never')
    driver.ok({
      type: 'match.rematch',
      actorId: 'ana',
      mode: 'change-settings',
    })
    expect(driver.state.phase).toBe('lobby')
    link(driver)
    expect(driver.effects).toEqual([])
  })

  it('starts a rematch with every account member already credited', () => {
    const driver = setup(null)
    playMatch(driver, 'stats')
    driver.ok({ type: 'match.rematch', actorId: 'ana', mode: 'same-settings' })
    expect(driver.state.match?.number).toBe(2)
    expect(driver.state.match?.creditedMemberIds).toEqual(['cy'])
    link(driver)
    expect(driver.effects).toEqual([])
  })
})
