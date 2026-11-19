import { matchGuess } from '@drawing-games/word-bank'

import type { TeamId } from '../types'
import {
  advanceRoom,
  applyRoomCommand,
  assertRoomInvariants,
  createRoomState,
  getNextWakeAtMs,
  projectRoomView,
} from './engine'
import { EMPTY_WORD_MEMORY, type PlayerWordMemory } from './records'
import type { RoomSettings } from './settings'
import type {
  RoomCommand,
  RoomCommandResult,
  RoomEffect,
  RoomError,
  RoomState,
  RoomView,
  TeamRoundState,
} from './types'

/**
 * Test-only harness around the pure engine: keeps the latest state and
 * clock, asserts invariants after every step, and records effects. It has
 * no test-framework dependency so it type-checks with the package.
 */
export class RoomDriver {
  state: RoomState
  now: number
  /** Effects produced by the most recent step. */
  effects: readonly RoomEffect[] = []
  /** Every effect produced so far, in order. */
  readonly history: RoomEffect[] = []

  constructor(
    options: { seed?: number; nowMs?: number; roomCode?: string } = {},
  ) {
    this.now = options.nowMs ?? 1_000_000
    this.state = createRoomState({
      roomCode: options.roomCode ?? 'TEST1',
      nowMs: this.now,
      seed: options.seed ?? 1,
    })
    assertRoomInvariants(this.state)
  }

  private record(state: RoomState, effects: readonly RoomEffect[]): void {
    assertRoomInvariants(state)
    this.state = state
    this.effects = effects
    this.history.push(...effects)
  }

  run(command: RoomCommand): RoomCommandResult {
    const result = applyRoomCommand(this.state, command, this.now)
    this.record(result.state, result.effects)
    return result
  }

  ok(command: RoomCommand): readonly RoomEffect[] {
    const result = this.run(command)
    if (!result.ok) {
      throw new Error(`${command.type} rejected: ${result.error.message}`)
    }
    return result.effects
  }

  fail(command: RoomCommand): RoomError {
    const result = this.run(command)
    if (result.ok) throw new Error(`${command.type} unexpectedly accepted`)
    return result.error
  }

  advanceTo(nowMs: number): readonly RoomEffect[] {
    this.now = Math.max(this.now, nowMs)
    const result = advanceRoom(this.state, this.now)
    this.record(result.state, result.effects)
    return result.effects
  }

  advanceBy(ms: number): readonly RoomEffect[] {
    return this.advanceTo(this.now + ms)
  }

  /** Jumps to the next wake time; false when the room is idle. */
  wake(): boolean {
    const next = getNextWakeAtMs(this.state)
    if (next === null) return false
    this.advanceTo(Math.max(next, this.now))
    return true
  }

  view(memberId: string | null): RoomView {
    return projectRoomView(this.state, memberId, this.now)
  }

  join(
    memberId: string,
    displayName: string,
    options: {
      team?: TeamId
      accountId?: string | null
      memory?: PlayerWordMemory
    } = {},
  ): void {
    this.ok({
      type: 'member.join',
      memberId,
      displayName,
      accountId: options.accountId ?? null,
      memory: options.memory ?? EMPTY_WORD_MEMORY,
      ...(options.team === undefined ? {} : { preferredTeam: options.team }),
    })
  }

  settings(actorId: string, patch: Partial<RoomSettings>): void {
    this.ok({ type: 'lobby.update-settings', actorId, patch })
  }

  readyAll(): void {
    for (const member of this.state.members) {
      if (
        member.kind === 'human' &&
        member.id !== this.state.hostId &&
        !member.ready
      ) {
        this.ok({ type: 'lobby.set-ready', actorId: member.id, ready: true })
      }
    }
  }

  teamRound(team: TeamId): TeamRoundState {
    const round = this.state.match?.round
    if (!round) throw new Error('no round')
    return round.teams[team]
  }

  drawer(team: TeamId): string {
    return this.teamRound(team).drawerId
  }

  /** The chosen term for a team in the live round. */
  term(team: TeamId): string {
    const teamRound = this.teamRound(team)
    const option = teamRound.options.find(
      (entry) => entry.wordId === teamRound.chosenWordId,
    )
    if (!option) throw new Error(`team ${team} has no word`)
    return option.term
  }

  /** Any team member who is not the current drawer. */
  guesser(team: TeamId): string {
    const drawer =
      this.state.phase === 'showdown'
        ? this.state.match?.showdown?.teams[team].drawerId
        : this.drawer(team)
    const member = this.state.members.find(
      (entry) =>
        entry.team === team &&
        entry.id !== drawer &&
        entry.kind === 'human' &&
        entry.left !== true,
    )
    if (!member) throw new Error(`team ${team} has no human guesser`)
    return member.id
  }

  /** Both drafts: each drawer picks its first card (or a chosen difficulty). */
  pickWords(difficulty?: 'easy' | 'medium' | 'hard'): void {
    for (const team of ['A', 'B'] as const) {
      if (this.state.phase !== 'word-draft') return
      const teamRound = this.teamRound(team)
      if (teamRound.chosenWordId !== null) continue
      const option =
        teamRound.options.find((entry) => entry.difficulty === difficulty) ??
        teamRound.options[0]
      if (!option) throw new Error('no options')
      this.ok({
        type: 'draft.select',
        actorId: teamRound.drawerId,
        wordId: option.wordId,
      })
    }
  }

  /** A human teammate guesses the live answer, 500 ms after the last step. */
  solve(team: TeamId, guesserId: string = this.guesser(team)): void {
    const text =
      this.state.phase === 'showdown'
        ? this.showdownTerm(team)
        : this.term(team)
    this.now += 500
    this.ok({ type: 'guess.submit', actorId: guesserId, text })
  }

  showdownTerm(team: TeamId): string {
    const teamState = this.state.match?.showdown?.teams[team]
    const card = teamState?.cards[teamState.cardIndex]
    if (!card) throw new Error(`team ${team} has no active card`)
    return card.term
  }
}

const CUSTOM_WORD_LISTS = new Map<number, readonly string[]>()

/**
 * Deterministic made-up words that are clearly different from each other
 * (the matcher calls every pair "wrong"), so tests never depend on the
 * curated packs, which other work keeps changing. The pairwise check is
 * quadratic, and property tests ask for the same list on every run, so each
 * list is built once and handed out as a fresh copy.
 */
export function customWordList(count: number): string[] {
  let words = CUSTOM_WORD_LISTS.get(count)
  if (words === undefined) {
    words = buildCustomWordList(count)
    CUSTOM_WORD_LISTS.set(count, words)
  }
  return [...words]
}

function buildCustomWordList(count: number): readonly string[] {
  const consonants = 'bdfgklmnprstvz'
  const vowels = 'aeiou'
  const words: string[] = []
  let seed = 12345
  const next = (modulo: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed % modulo
  }
  while (words.length < count) {
    let word = ''
    for (let index = 0; index < 3; index += 1) {
      word += `${consonants[next(consonants.length)]}${vowels[next(vowels.length)]}`
    }
    const distinct = words.every(
      (other) =>
        matchGuess(word, { term: other }) === 'wrong' &&
        matchGuess(other, { term: word }) === 'wrong',
    )
    if (distinct) words.push(word)
  }
  return words
}

/** A started 2v2 human room with Ana/Ben on A and Cy/Di on B. */
export function startHumanRoom(
  options: { seed?: number; settings?: Partial<RoomSettings> } = {},
): RoomDriver {
  const driver = new RoomDriver({ seed: options.seed ?? 7 })
  driver.join('ana', 'Ana', { team: 'A' })
  driver.join('ben', 'Ben', { team: 'A' })
  driver.join('cy', 'Cy', { team: 'B' })
  driver.join('di', 'Di', { team: 'B' })
  if (options.settings) driver.settings('ana', options.settings)
  driver.readyAll()
  driver.ok({ type: 'match.start', actorId: 'ana' })
  return driver
}
