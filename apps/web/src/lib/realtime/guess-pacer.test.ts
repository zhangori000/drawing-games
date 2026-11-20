import { expect, test } from 'vitest'

import { ManualTimers } from '../testing/manual-timers'
import { RoomCommandError } from './command-error'
import {
  GUESS_RATE_LIMIT_MESSAGE,
  GUESS_SPACING_MS,
  GuessPacer,
  isGuessRateLimited,
} from './guess-pacer'

interface Sent {
  readonly text: string
  readonly atMs: number
  readonly resolve: () => void
  readonly reject: (error: unknown) => void
}

function setup() {
  const timers = new ManualTimers()
  const sent: Sent[] = []
  const pacer = new GuessPacer({
    timers,
    now: timers.now,
    send: (text) =>
      new Promise<void>((resolve, reject) => {
        sent.push({ text, atMs: timers.now(), resolve, reject })
      }),
  })
  const outcomes: string[] = []
  const submit = (text: string) =>
    pacer.submit(text).then(
      () => outcomes.push(`${text}: ok`),
      (error: unknown) =>
        outcomes.push(
          `${text}: ${error instanceof Error ? error.message : 'failed'}`,
        ),
    )
  return { timers, sent, pacer, outcomes, submit }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const rateLimited = () =>
  new RoomCommandError('NOT_ALLOWED', GUESS_RATE_LIMIT_MESSAGE)

test('quick guesses go out one at a time, spaced after each answer, in order', async () => {
  const { timers, sent, outcomes, submit } = setup()
  void submit('apple')
  void submit('banana')
  void submit('cherry')
  expect(sent.map((s) => s.text)).toEqual(['apple'])

  // Nothing else goes out while apple is unanswered.
  timers.advance(2_000)
  expect(sent).toHaveLength(1)

  sent[0]?.resolve()
  await flush()
  const answeredAt = timers.now()
  timers.advance(GUESS_SPACING_MS - 1)
  expect(sent).toHaveLength(1)
  timers.advance(1)
  expect(sent.map((s) => s.text)).toEqual(['apple', 'banana'])
  expect((sent[1]?.atMs ?? 0) - answeredAt).toBe(GUESS_SPACING_MS)

  sent[1]?.resolve()
  await flush()
  timers.advance(GUESS_SPACING_MS)
  expect(sent.map((s) => s.text)).toEqual(['apple', 'banana', 'cherry'])
  sent[2]?.resolve()
  await flush()
  expect(outcomes).toEqual(['apple: ok', 'banana: ok', 'cherry: ok'])
})

test('a guess sent long after the last answer goes out at once', async () => {
  const { timers, sent, submit } = setup()
  void submit('apple')
  sent[0]?.resolve()
  await flush()
  timers.advance(GUESS_SPACING_MS + 100)
  void submit('banana')
  expect(sent.map((s) => s.text)).toEqual(['apple', 'banana'])
})

test('a rate-limit rejection is resent after the spacing, not dropped', async () => {
  const { timers, sent, outcomes, submit } = setup()
  void submit('banana')
  sent[0]?.reject(rateLimited())
  await flush()
  expect(outcomes).toEqual([])
  timers.advance(GUESS_SPACING_MS)
  expect(sent.map((s) => s.text)).toEqual(['banana', 'banana'])
  sent[1]?.resolve()
  await flush()
  expect(outcomes).toEqual(['banana: ok'])
})

test('a guess the room keeps rate-limiting fails after a few retries', async () => {
  const { timers, sent, outcomes, submit } = setup()
  void submit('banana')
  for (let attempt = 0; attempt < 3; attempt += 1) {
    sent[attempt]?.reject(rateLimited())
    await flush()
    timers.advance(GUESS_SPACING_MS)
  }
  expect(sent).toHaveLength(3)
  expect(outcomes).toEqual([`banana: ${GUESS_RATE_LIMIT_MESSAGE}`])
})

test('other rejections settle the guess and the queue moves on', async () => {
  const { timers, sent, outcomes, submit } = setup()
  void submit('apple')
  void submit('banana')
  sent[0]?.reject(new RoomCommandError('NOT_ALLOWED', 'Guessing is closed.'))
  await flush()
  expect(outcomes).toEqual(['apple: Guessing is closed.'])
  timers.advance(GUESS_SPACING_MS)
  expect(sent.map((s) => s.text)).toEqual(['apple', 'banana'])
})

test('cancel fails every guess still waiting', async () => {
  const { sent, pacer, outcomes, submit } = setup()
  void submit('apple')
  void submit('banana')
  void submit('cherry')
  expect(pacer.waiting).toBe(2)
  pacer.cancel()
  await flush()
  expect(outcomes).toEqual(['banana: Left the room.', 'cherry: Left the room.'])
  expect(sent).toHaveLength(1)
})

test('only the rate limit counts as rate-limited', () => {
  expect(isGuessRateLimited(rateLimited())).toBe(true)
  expect(
    isGuessRateLimited(
      new RoomCommandError('NOT_ALLOWED', 'Any wording', { retryable: true }),
    ),
  ).toBe(true)
  expect(
    isGuessRateLimited(
      new RoomCommandError('NOT_ALLOWED', 'Guessing is closed.'),
    ),
  ).toBe(false)
  expect(
    isGuessRateLimited(
      new RoomCommandError('TIMEOUT', 'No answer', { retryable: true }),
    ),
  ).toBe(false)
  expect(isGuessRateLimited(new Error(GUESS_RATE_LIMIT_MESSAGE))).toBe(false)
})
