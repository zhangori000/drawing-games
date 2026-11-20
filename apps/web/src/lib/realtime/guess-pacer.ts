import { isRoomCommandError, RoomCommandError } from './command-error'
import type { TimerApi } from './connection-types'
import { browserTimers } from './browser-adapters'

/**
 * The room accepts one guess per member every 400 ms
 * (`GUESS_MIN_INTERVAL_MS` in game-core's `room/constants.ts`) and rejects a
 * faster one with this message. The client paces itself a little wider.
 */
export const GUESS_RATE_LIMIT_MESSAGE = 'Slow down a little.'
export const GUESS_SPACING_MS = 450
/** How many times one guess is resent after a rate-limit rejection. */
export const GUESS_RATE_LIMIT_RETRIES = 2

export interface GuessPacerOptions {
  /** Sends one guess; resolves on the room's ack. */
  readonly send: (text: string) => Promise<void>
  readonly timers?: TimerApi
  readonly now?: () => number
  readonly spacingMs?: number
}

interface QueuedGuess {
  readonly text: string
  readonly resolve: () => void
  readonly reject: (error: unknown) => void
  retries: number
}

/**
 * Sends guesses one at a time, in order, at least `spacingMs` after the
 * previous guess was answered, so quick typists never trip the room's rate
 * limit. Spacing from the answer (not the send) is always enough: the room
 * stamped the previous guess before answering, and the next one reaches it
 * later still. A guess the room rejects only for coming too fast is sent
 * again after the spacing instead of failing; every other outcome settles the
 * guess's promise, so no guess is ever dropped silently.
 */
export class GuessPacer {
  private readonly queue: QueuedGuess[] = []
  private readonly sendGuess: (text: string) => Promise<void>
  private readonly timers: TimerApi
  private readonly now: () => number
  private readonly spacingMs: number
  private inFlight = false
  private timer: unknown = null
  private lastAnsweredAtMs = Number.NEGATIVE_INFINITY

  constructor(options: GuessPacerOptions) {
    this.sendGuess = options.send
    this.timers = options.timers ?? browserTimers
    this.now = options.now ?? Date.now
    this.spacingMs = options.spacingMs ?? GUESS_SPACING_MS
  }

  /** Guesses waiting for their turn (not counting one in flight). */
  get waiting(): number {
    return this.queue.length
  }

  submit(text: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ text, resolve, reject, retries: 0 })
      this.pump()
    })
  }

  /** Fails every guess that has not been sent yet (e.g. leaving the room). */
  cancel(
    error: unknown = new RoomCommandError('CLOSED', 'Left the room.'),
  ): void {
    if (this.timer !== null) {
      this.timers.clearTimeout(this.timer)
      this.timer = null
    }
    for (const guess of this.queue.splice(0)) guess.reject(error)
  }

  private pump(): void {
    if (this.inFlight || this.timer !== null) return
    const next = this.queue[0]
    if (!next) return
    const waitMs = this.lastAnsweredAtMs + this.spacingMs - this.now()
    if (waitMs > 0) {
      this.timer = this.timers.setTimeout(() => {
        this.timer = null
        this.pump()
      }, waitMs)
      return
    }
    this.queue.shift()
    this.inFlight = true
    let send: Promise<void>
    try {
      send = this.sendGuess(next.text)
    } catch (error) {
      send = Promise.reject(error)
    }
    send.then(
      () => {
        this.answered()
        next.resolve()
        this.pump()
      },
      (error: unknown) => {
        this.answered()
        if (
          isGuessRateLimited(error) &&
          next.retries < GUESS_RATE_LIMIT_RETRIES
        ) {
          next.retries += 1
          this.queue.unshift(next)
        } else {
          next.reject(error)
        }
        this.pump()
      },
    )
  }

  private answered(): void {
    this.inFlight = false
    this.lastAnsweredAtMs = this.now()
  }
}

/** True when the room refused a guess only because it came too fast. */
export function isGuessRateLimited(error: unknown): boolean {
  return (
    isRoomCommandError(error) &&
    error.code === 'NOT_ALLOWED' &&
    (error.retryable || error.message === GUESS_RATE_LIMIT_MESSAGE)
  )
}
