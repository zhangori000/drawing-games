import { describe, expect, it } from 'vitest'

import { RECONNECT_GRACE_MS } from './constants'
import { getNextWakeAtMs } from './engine'
import { RoomDriver } from './test-driver'

/**
 * Team A: a drawer and four human guessers; team B: two humans. Both words
 * picked, drawing open, and the hint vote unlocked (30 s in).
 */
function hintRoom(seed = 21): {
  driver: RoomDriver
  drawer: string
  guessers: string[]
} {
  const driver = new RoomDriver({ seed })
  for (const id of ['h', 'g1', 'g2', 'g3', 'g4']) {
    driver.join(id, id.toUpperCase(), { team: 'A' })
  }
  driver.join('x1', 'X1', { team: 'B' })
  driver.join('x2', 'X2', { team: 'B' })
  driver.readyAll()
  driver.ok({ type: 'match.start', actorId: 'h' })
  driver.pickWords()
  expect(driver.state.phase).toBe('drawing')
  const drawer = driver.drawer('A')
  const guessers = driver.state.members
    .filter((member) => member.team === 'A' && member.id !== drawer)
    .map((member) => member.id)
  expect(guessers).toHaveLength(4)
  driver.advanceBy(31_000)
  return { driver, drawer, guessers }
}

function voteYes(driver: RoomDriver, ids: readonly string[]): void {
  for (const id of ids) {
    driver.ok({ type: 'hint.vote', actorId: id, approve: true })
  }
}

describe('length hint vote after the electorate shrinks', () => {
  it('reveals at once when a non-voter leaves', () => {
    const { driver, guessers } = hintRoom()
    const [yes1, yes2, quiet1] = guessers as [string, string, string, string]
    voteYes(driver, [yes1, yes2])
    expect(driver.teamRound('A').hint.revealed).toBe(false)
    expect(driver.view(yes1).round?.mine?.hint).toMatchObject({
      votesFor: 2,
      votesNeeded: 3,
    })

    // {yes1, yes2, quiet2}: 2 yes of 3 is a majority.
    driver.now += 1_000
    driver.ok({ type: 'member.leave', memberId: quiet1 })

    const hint = driver.teamRound('A').hint
    expect(hint).toMatchObject({ revealed: true, revealedAtMs: driver.now })
    const mine = driver.view(yes1).round?.mine
    expect(mine?.hint).toMatchObject({ revealed: true, canVote: false })
    expect(mine?.pattern).toMatch(/^[_ '\-]+$/)
    // Team-local: the other team still sees nothing.
    expect(driver.view('x1').round?.mine?.pattern).toBeNull()
  })

  it('reveals when a non-voter grace runs out, not before', () => {
    const { driver, guessers } = hintRoom()
    const [yes1, yes2, quiet1, quiet2] = guessers as [
      string,
      string,
      string,
      string,
    ]
    voteYes(driver, [yes1, yes2])
    driver.ok({ type: 'member.presence', memberId: quiet1, connected: false })
    const dropAt = driver.now
    driver.now += 2_000
    driver.ok({ type: 'member.presence', memberId: quiet2, connected: false })
    const lastDropAt = driver.now

    // Once quiet1's grace runs out, 2 yes of {yes1, yes2, quiet2} is a
    // majority (quiet2 is still within grace).
    const firstExpiry = dropAt + RECONNECT_GRACE_MS + 1
    expect(getNextWakeAtMs(driver.state)).toBe(firstExpiry)
    driver.advanceTo(firstExpiry - 1)
    expect(driver.teamRound('A').hint.revealed).toBe(false)
    expect(driver.view(yes1).round?.mine?.hint.votesNeeded).toBe(3)

    // A late alarm still reveals at the moment it passed.
    driver.advanceTo(lastDropAt + 60_000)
    expect(driver.teamRound('A').hint).toMatchObject({
      revealed: true,
      revealedAtMs: firstExpiry,
    })
  })

  it('keeps the vote open for a teammate back within grace', () => {
    const { driver, guessers } = hintRoom()
    const [yes1, yes2, quiet1] = guessers as [string, string, string, string]
    voteYes(driver, [yes1, yes2])
    driver.ok({ type: 'member.presence', memberId: quiet1, connected: false })
    driver.now += RECONNECT_GRACE_MS
    driver.ok({ type: 'member.presence', memberId: quiet1, connected: true })
    expect(getNextWakeAtMs(driver.state)).toBe(driver.state.phaseDeadlineAtMs)
    driver.advanceBy(5_000)
    expect(driver.teamRound('A').hint.revealed).toBe(false)
    expect(driver.view(yes1).round?.mine?.hint).toMatchObject({
      votesFor: 2,
      votesNeeded: 3,
    })
  })

  it('does not count yes votes from teammates who dropped past grace', () => {
    const { driver, guessers } = hintRoom()
    const [yes1, yes2] = guessers as [string, string, string, string]
    voteYes(driver, [yes1, yes2])
    driver.ok({ type: 'member.presence', memberId: yes2, connected: false })
    driver.advanceBy(RECONNECT_GRACE_MS + 5_000)
    // {yes1, g3, g4}: one yes of three is not a majority.
    expect(driver.teamRound('A').hint.revealed).toBe(false)
    expect(driver.view(yes1).round?.mine?.hint).toMatchObject({
      votesFor: 1,
      votesNeeded: 2,
    })
  })

  it('reveals when a drawer takeover leaves a majority', () => {
    const { driver, drawer, guessers } = hintRoom()
    const order = driver.state.members
      .filter((member) => member.team === 'A')
      .map((member) => member.id)
    const next = order[(order.indexOf(drawer) + 1) % order.length]!
    const voters = guessers.filter((id) => id !== next).slice(0, 2)
    voteYes(driver, voters)
    expect(driver.teamRound('A').hint.revealed).toBe(false)

    driver.ok({ type: 'member.presence', memberId: drawer, connected: false })
    const takeoverAt = driver.now + RECONNECT_GRACE_MS
    driver.advanceTo(takeoverAt + 5_000)
    // `next` draws now, so 2 yes of the other three guessers is a majority.
    expect(driver.drawer('A')).toBe(next)
    expect(driver.teamRound('A').hint).toMatchObject({
      revealed: true,
      revealedAtMs: takeoverAt,
    })
  })

  it('never reveals on no votes or after the team solved', () => {
    const { driver, guessers } = hintRoom()
    const [yes1, no1, quiet1, quiet2] = guessers as [
      string,
      string,
      string,
      string,
    ]
    driver.ok({ type: 'hint.vote', actorId: no1, approve: false })
    driver.ok({ type: 'member.leave', memberId: quiet1 })
    driver.ok({ type: 'member.leave', memberId: quiet2 })
    expect(driver.teamRound('A').hint.revealed).toBe(false)

    driver.ok({ type: 'hint.vote', actorId: yes1, approve: true })
    // {yes1, no1}: a tie fails.
    expect(driver.teamRound('A').hint.revealed).toBe(false)
    driver.solve('A', yes1)
    driver.ok({ type: 'member.presence', memberId: no1, connected: false })
    driver.advanceBy(RECONNECT_GRACE_MS + 1_000)
    expect(driver.teamRound('A').hint.revealed).toBe(false)
  })
})

/** Team A (4 humans) trails team B by 100+ after three rounds. */
function surrenderRoom(): RoomDriver {
  const driver = new RoomDriver({ seed: 22 })
  for (const id of ['h', 'g1', 'g2', 'g3']) {
    driver.join(id, id.toUpperCase(), { team: 'A' })
  }
  driver.join('x1', 'X1', { team: 'B' })
  driver.join('x2', 'X2', { team: 'B' })
  driver.settings('h', { roundResultsSeconds: 20, showdown: false })
  driver.readyAll()
  driver.ok({ type: 'match.start', actorId: 'h' })
  for (let round = 0; round < 3; round += 1) {
    if (round > 0) driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    driver.pickWords('hard')
    driver.solve('B')
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
  }
  expect(driver.state.phase).toBe('round-results')
  expect(driver.view('g1').surrender).toMatchObject({
    eligible: true,
    votesNeeded: 3,
  })
  return driver
}

describe('surrender vote after the electorate shrinks', () => {
  it('ends the match when a non-voter drops past grace', () => {
    const driver = surrenderRoom()
    const scores = driver.state.match!.scores
    driver.ok({ type: 'surrender.vote', actorId: 'g1', approve: true })
    driver.ok({ type: 'surrender.vote', actorId: 'g2', approve: true })
    driver.ok({ type: 'member.presence', memberId: 'g3', connected: false })
    const expiry = driver.now + RECONNECT_GRACE_MS + 1
    expect(getNextWakeAtMs(driver.state)).toBe(expiry)
    driver.advanceTo(expiry - 1)
    expect(driver.state.phase).toBe('round-results')

    driver.advanceBy(10_000)
    expect(driver.state.phase).toBe('stats')
    expect(driver.state.match).toMatchObject({
      endedReason: 'surrender',
      winner: 'B',
      endedAtMs: expiry,
      scores,
    })
  })

  it('ends the match at once when a non-voter leaves', () => {
    const driver = surrenderRoom()
    driver.ok({ type: 'surrender.vote', actorId: 'g1', approve: true })
    driver.ok({ type: 'surrender.vote', actorId: 'g2', approve: true })
    expect(driver.state.phase).toBe('round-results')
    driver.now += 500
    driver.ok({ type: 'member.leave', memberId: 'g3' })
    expect(driver.state.phase).toBe('stats')
    expect(driver.state.match).toMatchObject({
      endedReason: 'surrender',
      winner: 'B',
      endedAtMs: driver.now,
    })
  })

  it('lets the next round start when nobody else drops', () => {
    const driver = surrenderRoom()
    driver.ok({ type: 'surrender.vote', actorId: 'g1', approve: true })
    driver.ok({ type: 'surrender.vote', actorId: 'g2', approve: true })
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.state.phase).toBe('word-draft')
    expect(driver.state.match?.endedReason).toBeNull()
  })
})
