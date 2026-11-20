import { describe, expect, it } from 'vitest'

import type { TeamId } from '../types'
import { customWordList, RoomDriver } from './test-driver'

/** P1, P2, P3 on A (in join order unless `three` is false); Q1, Q2 on B. */
function room(
  options: { readonly three?: boolean; readonly showdown?: boolean } = {},
): RoomDriver {
  const driver = new RoomDriver({ seed: 3 })
  driver.join('p1', 'P1', { team: 'A' })
  driver.join('p2', 'P2', { team: 'A' })
  if (options.three !== false) driver.join('p3', 'P3', { team: 'A' })
  driver.join('q1', 'Q1', { team: 'B' })
  driver.join('q2', 'Q2', { team: 'B' })
  driver.settings('p1', {
    rounds: 6,
    showdown: options.showdown ?? false,
    showdownSeconds: 120,
    customWordsMode: 'only',
    customWords: customWordList(60),
    packIds: [],
  })
  driver.readyAll()
  driver.ok({ type: 'match.start', actorId: 'p1' })
  return driver
}

/** Nobody solves: the drawing deadline, then the results deadline. */
function playRound(driver: RoomDriver): void {
  driver.pickWords()
  driver.advanceTo(driver.state.phaseDeadlineAtMs!)
  expect(driver.state.phase).toBe('round-results')
  driver.advanceTo(driver.state.phaseDeadlineAtMs!)
}

/** Team A's drawer for every remaining round; `before(r)` runs at each draft. */
function drawersOfA(
  driver: RoomDriver,
  before: (round: number) => void = () => {},
  after: (round: number) => void = () => {},
): string[] {
  const drawers: string[] = []
  for (let round = 1; driver.state.phase === 'word-draft'; round += 1) {
    before(round)
    drawers.push(driver.drawer('A'))
    playRound(driver)
    after(round)
  }
  return drawers
}

function expectNoBackToBack(drawers: readonly string[]): void {
  for (let index = 1; index < drawers.length; index += 1) {
    expect(
      drawers[index],
      `turn ${index + 1} of ${drawers.join(',')}`,
    ).not.toBe(drawers[index - 1])
  }
}

describe('drawer rotation', () => {
  it('goes round-robin in join order', () => {
    const driver = room()
    expect(drawersOfA(driver)).toEqual(['p1', 'p2', 'p3', 'p1', 'p2', 'p3'])
  })

  it('skips a teammate who is away without giving anyone a double turn', () => {
    const driver = room()
    driver.ok({ type: 'member.presence', memberId: 'p2', connected: false })
    const drawers = drawersOfA(driver)
    expect(drawers).toEqual(['p1', 'p3', 'p1', 'p3', 'p1', 'p3'])
  })

  it('gives a returning teammate their next turn in order', () => {
    const driver = room()
    driver.ok({ type: 'member.presence', memberId: 'p2', connected: false })
    const drawers = drawersOfA(driver, (round) => {
      if (round === 3) {
        driver.ok({ type: 'member.presence', memberId: 'p2', connected: true })
      }
    })
    // Back during round 3 (P1's turn): P2 is next, then P3, then P1.
    expect(drawers).toEqual(['p1', 'p3', 'p1', 'p2', 'p3', 'p1'])
  })

  it('slots a mid-match joiner in at their join position', () => {
    const driver = room({ three: false })
    const drawers = drawersOfA(driver, (round) => {
      if (round === 3) driver.join('p3', 'P3', { team: 'A' })
    })
    expect(drawers).toEqual(['p1', 'p2', 'p1', 'p2', 'p3', 'p1'])
    expectNoBackToBack(drawers)
  })

  it('carries on after a teammate leaves mid-match', () => {
    const driver = room()
    const drawers = drawersOfA(
      driver,
      () => {},
      (round) => {
        if (round === 2) driver.ok({ type: 'member.leave', memberId: 'p1' })
      },
    )
    expect(drawers).toEqual(['p1', 'p2', 'p3', 'p2', 'p3', 'p2'])
  })

  it('continues after a mid-turn takeover instead of repeating the taker', () => {
    const driver = room()
    // P1 leaves during round 1's draft: P2 takes over round 1.
    driver.ok({ type: 'member.leave', memberId: 'p1' })
    const drawers = drawersOfA(driver)
    expect(drawers).toEqual(['p2', 'p3', 'p2', 'p3', 'p2', 'p3'])
  })

  it('runs the showdown relay on the same rotation, one card each', () => {
    const driver = room({ showdown: true })
    driver.ok({ type: 'member.presence', memberId: 'p2', connected: false })
    driver.advanceBy(11_000)
    for (let round = 0; round < 6; round += 1) {
      driver.pickWords()
      driver.solve('A', driver.drawer('A') === 'p1' ? 'p3' : 'p1')
      driver.solve('B')
      driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    }
    expect(driver.state.phase).toBe('showdown')
    const relay: string[] = []
    const teamA = () => driver.state.match!.showdown!.teams.A
    while (teamA().drawerId !== null) {
      const drawer = teamA().drawerId!
      relay.push(drawer)
      driver.solve('A', drawer === 'p1' ? 'p3' : 'p1')
    }
    // The rounds ended on P3, so the relay starts with P1 and alternates.
    expect(relay).toEqual(['p1', 'p3', 'p1', 'p3', 'p1', 'p3'])
    const drawn = (id: string) =>
      driver.state.match!.stats[id]!.showdownCardsDrawn
    expect(Math.abs(drawn('p1') - drawn('p3'))).toBeLessThanOrEqual(1)
    expect(drawn('p2')).toBe(0)
  })

  it('keeps both teams independent', () => {
    const driver = room()
    const teamB: string[] = []
    drawersOfA(driver, () => {
      teamB.push(driver.drawer('B' as TeamId))
    })
    expect(teamB).toEqual(['q1', 'q2', 'q1', 'q2', 'q1', 'q2'])
  })
})
