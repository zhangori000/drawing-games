import { expect, test } from 'vitest'

import { RECONNECT_MAX_DELAY_MS, reconnectDelayMs } from './backoff'
import { ServerClock } from './server-clock'

test('reconnect delay doubles from 250 ms, caps at 8 s, keeps half the window', () => {
  expect(reconnectDelayMs(0, () => 0)).toBe(125)
  expect(reconnectDelayMs(0, () => 1)).toBe(250)
  expect(reconnectDelayMs(1, () => 1)).toBe(500)
  expect(reconnectDelayMs(5, () => 1)).toBe(RECONNECT_MAX_DELAY_MS)
  expect(reconnectDelayMs(50, () => 0)).toBe(RECONNECT_MAX_DELAY_MS / 2)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const delay = reconnectDelayMs(attempt)
    expect(delay).toBeGreaterThanOrEqual(125)
    expect(delay).toBeLessThanOrEqual(RECONNECT_MAX_DELAY_MS)
  }
})

test('server clock smooths samples and ignores a latency spike', () => {
  const clock = new ServerClock()
  expect(clock.now(1_000)).toBe(1_000)

  clock.observe(11_000, 1_000) // server is 10 s ahead
  clock.observe(11_100, 1_050)
  expect(Math.abs(clock.offset - 10_025)).toBeLessThan(1)

  clock.observe(13_000, 4_000) // one sample 1 s+ late: ignored
  expect(Math.abs(clock.offset - 10_025)).toBeLessThan(1)
  expect(clock.now(2_000)).toBe(12_025)
})

test('server clock resets after repeated outliers (device clock jumped)', () => {
  const clock = new ServerClock()
  clock.observe(10_000, 10_000)
  clock.observe(10_000, 70_000)
  clock.observe(10_000, 70_000)
  expect(clock.offset).toBe(0)
  clock.observe(10_000, 70_000)
  expect(clock.offset).toBe(-60_000)
})
