import { afterEach, describe, expect, it, vi } from 'vitest'

import { advanceRoom, applyRoomCommand, getNextWakeAtMs } from './engine'
import { RoomDriver } from './test-driver'
import type { RoomEffect, RoomState } from './types'

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const entry of Object.values(value)) deepFreeze(entry)
  }
  return value
}

/** A mixed human + bot match driven by a fixed script. */
function scriptedRun(seed: number): {
  state: RoomState
  effects: RoomEffect[]
} {
  const driver = new RoomDriver({ seed })
  driver.join('ana', 'Ana', { team: 'A', accountId: 'ana' })
  driver.join('cy', 'Cy', { team: 'B' })
  driver.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'A' })
  driver.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'B' })
  driver.ok({ type: 'lobby.shuffle-teams', actorId: 'ana' })
  driver.settings('ana', { rounds: 4 })
  driver.readyAll()
  driver.ok({ type: 'lobby.set-ready', actorId: 'cy', ready: true })
  driver.ok({ type: 'match.start', actorId: 'ana' })
  for (let step = 0; step < 400 && driver.state.phase !== 'stats'; step += 1) {
    driver.wake()
    if (driver.state.phase === 'word-draft') driver.pickWords()
    if (driver.state.phase === 'drawing' && step % 3 === 0) {
      driver.now += 400
      driver.run({ type: 'guess.submit', actorId: 'cy', text: `try ${step}` })
    }
  }
  return { state: driver.state, effects: driver.history }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('determinism', () => {
  it('produces deep-equal states and effects for the same inputs', () => {
    const first = scriptedRun(42)
    const second = scriptedRun(42)
    expect(first.state.phase).toBe('stats')
    expect(second).toEqual(first)
    expect(scriptedRun(43).state).not.toEqual(first.state)
  })

  it('never reads the ambient clock or Math.random', () => {
    vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now used')
    })
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random used')
    })
    expect(scriptedRun(7).state.phase).toBe('stats')
  })

  it('never mutates its input state', () => {
    const driver = new RoomDriver({ seed: 5 })
    driver.join('ana', 'Ana', { team: 'A' })
    driver.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'A' })
    driver.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'B' })
    driver.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'B' })
    driver.settings('ana', { rounds: 2 })
    driver.ok({ type: 'match.start', actorId: 'ana' })
    let state = driver.state
    let now = driver.now
    for (let step = 0; step < 2_000 && state.phase !== 'stats'; step += 1) {
      deepFreeze(state)
      now = getNextWakeAtMs(state) ?? now
      state = advanceRoom(state, now).state
      deepFreeze(state)
      const result = applyRoomCommand(
        state,
        { type: 'guess.submit', actorId: 'ana', text: `x${step}` },
        now + 1,
      )
      state = result.state
    }
    expect(state.phase).toBe('stats')
  })

  it('gives the same outcome whether alarms fire on time or late', () => {
    const build = () => {
      const driver = new RoomDriver({ seed: 77 })
      driver.join('ana', 'Ana', { team: 'A' })
      driver.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'A' })
      driver.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'B' })
      driver.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'B' })
      driver.settings('ana', { rounds: 2 })
      driver.ok({ type: 'match.start', actorId: 'ana' })
      return driver
    }
    const punctual = build()
    const effects: RoomEffect[] = []
    while (punctual.state.phase !== 'stats') {
      const next = getNextWakeAtMs(punctual.state)
      if (next === null) break
      effects.push(...punctual.advanceTo(next))
    }
    const late = build()
    const finishedAt = punctual.now
    const lateEffects = late.advanceTo(finishedAt + 3_600_000)
    expect(late.state).toEqual(punctual.state)
    expect(lateEffects).toEqual(effects)

    // A halfway catch-up also converges.
    const halfway = build()
    halfway.advanceTo(Math.floor((halfway.now + finishedAt) / 2))
    halfway.advanceTo(finishedAt)
    expect(halfway.state).toEqual(punctual.state)
  })

  it('continues identically after a JSON round-trip (persisted state)', () => {
    const live = new RoomDriver({ seed: 9 })
    live.join('ana', 'Ana', { team: 'A' })
    live.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'A' })
    live.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'B' })
    live.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'B' })
    live.ok({ type: 'match.start', actorId: 'ana' })
    live.advanceBy(40_000)
    const restored: RoomState = JSON.parse(
      JSON.stringify(live.state),
    ) as RoomState
    expect(restored).toEqual(live.state)
    const later = live.now + 200_000
    expect(advanceRoom(restored, later)).toEqual(advanceRoom(live.state, later))
  })

  it('increments seq on accepted changes only', () => {
    const driver = new RoomDriver()
    driver.join('ana', 'Ana')
    const seq = driver.state.seq
    driver.fail({ type: 'match.start', actorId: 'ana' })
    expect(driver.state.seq).toBe(seq)
    driver.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'A' })
    expect(driver.state.seq).toBe(seq + 1)
    const idle = advanceRoom(driver.state, driver.now + 1_000_000)
    expect(idle.state).toBe(driver.state)
    expect(idle.effects).toEqual([])
  })
})
