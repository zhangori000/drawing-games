export const RECONNECT_BASE_DELAY_MS = 250
export const RECONNECT_MAX_DELAY_MS = 8_000

/**
 * Capped exponential backoff with "equal jitter": the delay for `attempt`
 * (0-based) is uniformly drawn from [cap/2, cap], where cap doubles from
 * 250 ms up to 8 s. Half the window is guaranteed so a flapping server is not
 * hammered; the random half spreads a room's clients apart after an outage.
 */
export function reconnectDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(0, Math.min(Math.floor(attempt), 16))
  const cap = Math.min(
    RECONNECT_MAX_DELAY_MS,
    RECONNECT_BASE_DELAY_MS * 2 ** exponent,
  )
  const jitter = Math.min(1, Math.max(0, random()))
  return Math.round(cap / 2 + (cap / 2) * jitter)
}
