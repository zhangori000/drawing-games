import type { DrawingAction } from '@drawing-games/drawing-model'
import { describe, expect, it } from 'vitest'

import { RECONNECT_GRACE_MS } from './constants'
import { getNextWakeAtMs } from './engine'
import { customWordList, RoomDriver } from './test-driver'
import type { RoomEffect } from './types'

const STROKE: DrawingAction[] = [
  {
    type: 'stroke.begin',
    strokeId: 'h1',
    point: { x: 0.2, y: 0.2 },
    style: { color: '#000000', width: 0.01, opacity: 1 },
  },
  { type: 'stroke.end', strokeId: 'h1', pointCount: 1 },
]

/** Ana, Ben, and Eve on A (Ana draws first); Cy and Di on B. */
function threeVsTwo(
  options: {
    readonly accounts?: boolean
    readonly showdown?: boolean
    readonly botsOnA?: number
  } = {},
): RoomDriver {
  const driver = new RoomDriver({ seed: 5 })
  const account = (id: string) =>
    options.accounts === true ? { accountId: `${id}-acct` } : {}
  driver.join('ana', 'Ana', { team: 'A', ...account('ana') })
  if (options.botsOnA === undefined) {
    driver.join('ben', 'Ben', { team: 'A', ...account('ben') })
    driver.join('eve', 'Eve', { team: 'A' })
  } else {
    for (let index = 0; index < options.botsOnA; index += 1) {
      driver.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'A' })
    }
  }
  driver.join('cy', 'Cy', { team: 'B' })
  driver.join('di', 'Di', { team: 'B' })
  driver.settings('ana', {
    rounds: 2,
    showdown: options.showdown ?? false,
    showdownSeconds: 60,
    replacementsPerDrawer: 2,
    customWordsMode: 'only',
    customWords: customWordList(40),
    packIds: [],
  })
  driver.readyAll()
  driver.ok({ type: 'match.start', actorId: 'ana' })
  expect(driver.drawer('A')).toBe('ana')
  return driver
}

function leave(driver: RoomDriver, memberId: string): void {
  driver.ok({ type: 'member.leave', memberId })
}

function wakeUntil(driver: RoomDriver, done: () => boolean): void {
  for (let step = 0; step < 200 && !done(); step += 1) {
    if (!driver.wake()) break
  }
  expect(done()).toBe(true)
}

function wordEventsFor(effects: readonly RoomEffect[], accountId: string) {
  return effects
    .flatMap((effect) =>
      effect.type === 'account.words' && effect.accountId === accountId
        ? effect.events
        : [],
    )
    .map((event) => event.role)
    .sort()
}

describe('a drawer who leaves mid-turn hands the turn over', () => {
  it('passes the draft to the next teammate with the same cards, swaps, and time', () => {
    const driver = threeVsTwo({ accounts: true })
    const deadline = driver.state.phaseDeadlineAtMs
    const swapped = driver.teamRound('A').options[0]!
    driver.ok({
      type: 'draft.replace',
      actorId: 'ana',
      wordId: swapped.wordId,
      reason: 'seen-before',
    })
    const cards = driver.teamRound('A').options
    const opponentBefore = driver.teamRound('B')

    leave(driver, 'ana')
    expect(driver.drawer('A')).toBe('ben')
    expect(driver.teamRound('A').options).toEqual(cards)
    expect(driver.state.phaseDeadlineAtMs).toBe(deadline)
    expect(driver.teamRound('B')).toEqual(opponentBefore)
    expect(driver.view('ben').round?.mine).toMatchObject({
      amDrawer: true,
      replacementsLeft: 1,
      options: expect.arrayContaining([
        expect.objectContaining({ wordId: cards[1]!.wordId }),
      ]),
    })
    expect(driver.view('eve').round?.mine).toMatchObject({
      drawerId: 'ben',
      amDrawer: false,
      options: null,
    })

    driver.pickWords()
    expect(driver.state.phase).toBe('drawing')
    driver.solve('A', 'eve')
    const roundEnd = driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.view('eve').results?.teams.A.drawerName).toBe('Ben')
    // Ana keeps the report she made; Ben drew the word and saw the cards.
    expect(wordEventsFor(roundEnd, 'ana-acct')).toEqual(['seen-report'])
    expect(wordEventsFor(roundEnd, 'ben-acct')).toEqual([
      'drew',
      'offered',
      'offered',
    ])

    // The rotation carries on from the remaining roster.
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.state.phase).toBe('word-draft')
    expect(driver.drawer('A')).toBe('eve')
  })

  it('passes the drawing to the next teammate with the same word and canvas', () => {
    const driver = threeVsTwo()
    driver.pickWords()
    const term = driver.term('A')
    const canvasId = driver.teamRound('A').canvasId
    driver.ok({ type: 'drawing.ops', actorId: 'ana', ops: STROKE })
    const deadline = driver.state.phaseDeadlineAtMs

    leave(driver, 'ana')
    expect(driver.drawer('A')).toBe('ben')
    expect(driver.teamRound('A')).toMatchObject({ canvasId, strokeCount: 1 })
    expect(driver.state.phaseDeadlineAtMs).toBe(deadline)
    expect(driver.view('ben').round?.mine).toMatchObject({
      amDrawer: true,
      canDraw: true,
      canGuess: false,
      word: expect.objectContaining({ term }),
    })
    expect(driver.view('eve').round?.mine).toMatchObject({
      amDrawer: false,
      canGuess: true,
      word: null,
    })
    // Custom words sit in the (public) settings; nothing else names the term.
    const { settings: _settings, ...eveView } = driver.view('eve')
    expect(JSON.stringify(eveView)).not.toContain(term)

    driver.ok({ type: 'drawing.ops', actorId: 'ben', ops: STROKE })
    expect(
      driver.fail({ type: 'guess.submit', actorId: 'ben', text: term }).code,
    ).toBe('NOT_ALLOWED')
    expect(
      driver.fail({ type: 'drawing.ops', actorId: 'ana', ops: STROKE }).code,
    ).toBe('NOT_ALLOWED')

    driver.solve('A', 'eve')
    driver.solve('B')
    expect(driver.state.phase).toBe('round-results')
    expect(driver.view('eve').results?.teams.A).toMatchObject({
      drawerName: 'Ben',
      solved: true,
    })
    expect(driver.state.match?.scores.A).toBeGreaterThan(0)
  })

  it('leaves a team that already solved alone', () => {
    const driver = threeVsTwo()
    driver.pickWords()
    driver.solve('A', 'eve')
    leave(driver, 'ana')
    expect(driver.drawer('A')).toBe('ana')
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.view('eve').results?.teams.A.drawerName).toBe('Ana')
  })

  it('skips teammates past their reconnect grace when someone else is here', () => {
    const driver = threeVsTwo()
    driver.ok({ type: 'member.presence', memberId: 'ben', connected: false })
    driver.advanceBy(11_000)
    leave(driver, 'ana')
    expect(driver.drawer('A')).toBe('eve')
  })

  it('keeps the seat when nobody is left to take it', () => {
    const driver = threeVsTwo()
    leave(driver, 'ben')
    leave(driver, 'eve')
    leave(driver, 'ana')
    expect(driver.drawer('A')).toBe('ana')
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.state.phase).toBe('drawing')
  })

  it('hands the draft and the drawing to a practice bot', () => {
    const draft = threeVsTwo({ botsOnA: 1 })
    leave(draft, 'ana')
    const bot = draft.drawer('A')
    expect(bot).toMatch(/^bot_/)
    expect(draft.state.hostId).toBe('cy')
    draft.ok({
      type: 'draft.select',
      actorId: 'cy',
      wordId: draft.teamRound('B').options[0]!.wordId,
    })
    wakeUntil(draft, () => draft.state.phase === 'drawing')
    expect(draft.teamRound('A').chosenBy).toBe('drawer')

    const drawing = threeVsTwo({ botsOnA: 2 })
    drawing.pickWords()
    leave(drawing, 'ana')
    const drawer = drawing.drawer('A')
    expect(drawer).toMatch(/^bot_/)
    const strokes: RoomEffect[] = []
    wakeUntil(drawing, () => {
      strokes.push(...drawing.effects)
      return drawing.teamRound('A').solution !== null
    })
    expect(
      strokes.some(
        (effect) =>
          effect.type === 'canvas.ops' &&
          effect.origin === 'bot' &&
          effect.actorId === drawer,
      ),
    ).toBe(true)
    expect(drawing.teamRound('A').solution?.guesserId).not.toBe(drawer)
  })

  it('passes a showdown card to the next relay drawer', () => {
    const driver = threeVsTwo({ showdown: true })
    for (let round = 0; round < 2; round += 1) {
      driver.pickWords()
      driver.advanceTo(driver.state.phaseDeadlineAtMs!)
      driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    }
    expect(driver.state.phase).toBe('showdown')
    const teamA = () => driver.state.match!.showdown!.teams.A
    const leaver = teamA().drawerId!
    const canvasId = teamA().canvasId
    const drawnBefore = (id: string) =>
      driver.state.match!.stats[id]!.showdownCardsDrawn

    leave(driver, leaver)
    const next = teamA().drawerId!
    expect(next).not.toBe(leaver)
    expect(teamA()).toMatchObject({ cardIndex: 0, canvasId })
    expect(drawnBefore(next)).toBe(1)
    expect(driver.view(next).showdown?.mine?.word?.term).toBe(
      driver.showdownTerm('A'),
    )

    const guesser = ['ana', 'ben', 'eve'].find(
      (id) => id !== leaver && id !== next,
    )!
    driver.solve('A', guesser)
    expect(teamA().cardIndex).toBe(1)
    expect(teamA().results?.[0]).toMatchObject({
      drawerId: next,
      guesserId: guesser,
    })
  })
})

function presence(driver: RoomDriver, memberId: string, connected: boolean) {
  driver.ok({ type: 'member.presence', memberId, connected })
}

describe('a drawer who stays disconnected past the reconnect grace', () => {
  it('keeps the turn when back within the grace', () => {
    const driver = threeVsTwo()
    driver.advanceBy(1_000)
    presence(driver, 'ana', false)
    const droppedAt = driver.now
    expect(getNextWakeAtMs(driver.state)).toBe(droppedAt + RECONNECT_GRACE_MS)
    driver.advanceBy(RECONNECT_GRACE_MS - 1_000)
    presence(driver, 'ana', true)
    driver.advanceBy(5_000)
    expect(driver.drawer('A')).toBe('ana')
    expect(getNextWakeAtMs(driver.state)).toBe(driver.state.phaseDeadlineAtMs)
  })

  it('hands the draft to the next connected teammate with the same cards and time', () => {
    const driver = threeVsTwo({ accounts: true })
    const deadline = driver.state.phaseDeadlineAtMs
    const swapped = driver.teamRound('A').options[0]!
    driver.ok({
      type: 'draft.replace',
      actorId: 'ana',
      wordId: swapped.wordId,
      reason: 'seen-before',
    })
    const cards = driver.teamRound('A').options
    driver.advanceBy(1_000)
    presence(driver, 'ana', false)
    driver.advanceBy(RECONNECT_GRACE_MS - 1)
    expect(driver.drawer('A')).toBe('ana')
    driver.advanceBy(1)
    expect(driver.state.phase).toBe('word-draft')
    expect(driver.drawer('A')).toBe('ben')
    expect(driver.teamRound('A').options).toEqual(cards)
    expect(driver.state.phaseDeadlineAtMs).toBe(deadline)
    expect(driver.view('ben').round?.mine).toMatchObject({
      amDrawer: true,
      replacementsLeft: 1,
    })
    driver.pickWords()
    expect(driver.teamRound('A').chosenBy).toBe('drawer')

    // Back after the takeover: Ana saw the cards, so she sits this word out.
    presence(driver, 'ana', true)
    expect(driver.drawer('A')).toBe('ben')
    expect(driver.view('ana').round?.mine).toMatchObject({
      amDrawer: false,
      canGuess: false,
      word: null,
      options: null,
    })
    expect(
      driver.fail({
        type: 'guess.submit',
        actorId: 'ana',
        text: driver.term('A'),
      }).message,
    ).toBe('You saw this word as the drawer, so sit this one out.')
    driver.solve('A', 'eve')
    const roundEnd = driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    // Ana keeps her report and saw every card, but gets no "missed" for a
    // word she could not guess.
    expect(wordEventsFor(roundEnd, 'ana-acct')).toEqual([
      'offered',
      'offered',
      'offered',
      'seen-report',
    ])
    expect(wordEventsFor(roundEnd, 'ben-acct')).toEqual([
      'drew',
      'offered',
      'offered',
    ])
    // Next round Ana guesses again, and the rotation continues after Ben.
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.drawer('A')).toBe('eve')
    driver.pickWords()
    expect(driver.view('ana').round?.mine?.canGuess).toBe(true)
  })

  it('waits for the drawer when nobody else could guess', () => {
    const pair = new RoomDriver({ seed: 5 })
    pair.join('ana', 'Ana', { team: 'A' })
    pair.join('ben', 'Ben', { team: 'A' })
    pair.join('cy', 'Cy', { team: 'B' })
    pair.join('di', 'Di', { team: 'B' })
    pair.readyAll()
    pair.ok({ type: 'match.start', actorId: 'ana' })
    pair.pickWords()
    presence(pair, 'ana', false)
    // Only the host hand-over (15 s) is pending, no drawer takeover.
    expect(getNextWakeAtMs(pair.state)).toBe(pair.now + 15_000)
    pair.advanceBy(30_000)
    expect(pair.drawer('A')).toBe('ana')
    // Back, Ana simply carries on drawing for Ben.
    presence(pair, 'ana', true)
    pair.ok({ type: 'drawing.ops', actorId: 'ana', ops: STROKE })
    pair.solve('A', 'ben')
    expect(pair.teamRound('A').solution?.guesserId).toBe('ben')
  })

  it('hands the drawing over with the same word, canvas, and deadline', () => {
    const driver = threeVsTwo()
    driver.pickWords()
    const term = driver.term('A')
    const canvasId = driver.teamRound('A').canvasId
    driver.ok({ type: 'drawing.ops', actorId: 'ana', ops: STROKE })
    const deadline = driver.state.phaseDeadlineAtMs
    presence(driver, 'ana', false)
    // Ben is away too (but still within his grace): Eve, who is here, draws.
    presence(driver, 'ben', false)
    driver.advanceBy(RECONNECT_GRACE_MS)
    expect(driver.drawer('A')).toBe('eve')
    expect(driver.teamRound('A')).toMatchObject({ canvasId, strokeCount: 1 })
    expect(driver.state.phaseDeadlineAtMs).toBe(deadline)
    expect(driver.view('eve').round?.mine).toMatchObject({
      amDrawer: true,
      canDraw: true,
      word: expect.objectContaining({ term }),
    })
    driver.ok({ type: 'drawing.ops', actorId: 'eve', ops: STROKE })
    presence(driver, 'ana', true)
    expect(
      driver.fail({ type: 'drawing.ops', actorId: 'ana', ops: STROKE }).code,
    ).toBe('NOT_ALLOWED')
    expect(driver.view('ana').round?.mine?.canGuess).toBe(false)
    presence(driver, 'ben', true)
    driver.solve('A', 'ben')
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.view('ana').results?.teams.A).toMatchObject({
      drawerName: 'Eve',
      solved: true,
    })
  })

  it('processes a late alarm exactly like an on-time one', () => {
    const onTime = threeVsTwo()
    const late = threeVsTwo()
    for (const driver of [onTime, late]) {
      driver.pickWords()
      presence(driver, 'ana', false)
    }
    onTime.advanceBy(RECONNECT_GRACE_MS)
    onTime.advanceBy(20_000)
    late.advanceBy(RECONNECT_GRACE_MS + 20_000)
    expect(late.state).toEqual(onTime.state)
  })

  it('leaves the turn alone when no teammate is connected', () => {
    const driver = threeVsTwo()
    presence(driver, 'ben', false)
    presence(driver, 'eve', false)
    presence(driver, 'ana', false)
    expect(getNextWakeAtMs(driver.state)).toBe(driver.state.phaseDeadlineAtMs)
    driver.advanceBy(RECONNECT_GRACE_MS + 1_000)
    expect(driver.drawer('A')).toBe('ana')
    // Eve comes back: she takes over at once (Ana's grace is long gone).
    presence(driver, 'eve', true)
    expect(driver.drawer('A')).toBe('eve')
  })

  it('lets someone who joins later pick up a turn its leaver could not hand over', () => {
    const driver = threeVsTwo()
    leave(driver, 'ben')
    leave(driver, 'eve')
    leave(driver, 'ana')
    expect(driver.drawer('A')).toBe('ana')
    driver.join('fay', 'Fay', { team: 'A' })
    // Fay alone could draw for nobody; with Gus here she takes over.
    expect(driver.drawer('A')).toBe('ana')
    driver.join('gus', 'Gus', { team: 'A' })
    expect(driver.drawer('A')).toBe('fay')
  })

  it('hands a showdown card to the next connected relay drawer', () => {
    const driver = threeVsTwo({ showdown: true })
    for (let round = 0; round < 2; round += 1) {
      driver.pickWords()
      driver.advanceTo(driver.state.phaseDeadlineAtMs!)
      driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    }
    expect(driver.state.phase).toBe('showdown')
    const teamA = () => driver.state.match!.showdown!.teams.A
    const dropped = teamA().drawerId!
    const canvasId = teamA().canvasId
    presence(driver, dropped, false)
    driver.advanceBy(RECONNECT_GRACE_MS)
    const next = teamA().drawerId!
    expect(next).not.toBe(dropped)
    expect(teamA()).toMatchObject({ cardIndex: 0, canvasId })
    expect(driver.view(next).showdown?.mine?.word?.term).toBe(
      driver.showdownTerm('A'),
    )
    presence(driver, dropped, true)
    expect(driver.view(dropped).showdown?.mine).toMatchObject({
      amDrawer: false,
      canGuess: false,
      word: null,
    })
    const guesser = ['ana', 'ben', 'eve'].find(
      (id) => id !== dropped && id !== next,
    )!
    driver.solve('A', guesser)
    expect(teamA()).toMatchObject({ cardIndex: 1 })
    expect(teamA().results?.[0]).toMatchObject({
      drawerId: next,
      guesserId: guesser,
    })
    // A new card: the dropped drawer may guess again.
    expect(driver.view(dropped).showdown?.mine?.canGuess).toBe(
      teamA().drawerId !== dropped,
    )
  })

  it('hands the drawing to a practice bot teammate', () => {
    const driver = threeVsTwo({ botsOnA: 2 })
    driver.pickWords()
    presence(driver, 'ana', false)
    driver.advanceBy(RECONNECT_GRACE_MS)
    expect(driver.drawer('A')).toMatch(/^bot_/)
    wakeUntil(driver, () => driver.state.phase === 'round-results')
  })
})
