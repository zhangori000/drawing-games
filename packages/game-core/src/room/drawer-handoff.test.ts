import type { DrawingAction } from '@drawing-games/drawing-model'
import { describe, expect, it } from 'vitest'

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

  it('does nothing for a drawer who only disconnects', () => {
    const driver = threeVsTwo()
    driver.ok({ type: 'member.presence', memberId: 'ana', connected: false })
    expect(driver.drawer('A')).toBe('ana')
    driver.pickWords()
    driver.ok({ type: 'member.presence', memberId: 'ana', connected: false })
    driver.advanceBy(30_000)
    expect(driver.drawer('A')).toBe('ana')
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
