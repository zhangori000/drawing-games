import { afterEach, describe, expect, test, vi } from 'vitest'

import { realtimeBaseUrl, realtimeHttpUrl, realtimeWsUrl } from './config'

function openPageAt(url: string): void {
  const { protocol, hostname } = new URL(url)
  vi.stubGlobal('window', { location: { protocol, hostname } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('realtime config without NEXT_PUBLIC_REALTIME_URL', () => {
  test('uses the page’s own host on port 8787 (pnpm dev, LAN phones)', () => {
    vi.stubEnv('NEXT_PUBLIC_REALTIME_URL', '')
    openPageAt('http://192.168.1.20:3000/play/ABCD')
    expect(realtimeBaseUrl()).toBe('http://192.168.1.20:8787')
    expect(realtimeHttpUrl('rooms')).toBe('http://192.168.1.20:8787/rooms')
    expect(realtimeWsUrl('/rooms/ABCD/socket')).toBe(
      'ws://192.168.1.20:8787/rooms/ABCD/socket',
    )
  })

  test('keeps the page’s scheme and IPv6 brackets', () => {
    vi.stubEnv('NEXT_PUBLIC_REALTIME_URL', '  ')
    openPageAt('https://[::1]:3000/')
    expect(realtimeWsUrl('/x')).toBe('wss://[::1]:8787/x')
  })

  test('cannot be derived outside the browser', () => {
    vi.stubEnv('NEXT_PUBLIC_REALTIME_URL', '')
    vi.stubGlobal('window', undefined)
    expect(() => realtimeBaseUrl()).toThrow(/browser/)
  })
})

describe('realtime config with NEXT_PUBLIC_REALTIME_URL', () => {
  test('uses the configured base, without trailing slashes', () => {
    vi.stubEnv('NEXT_PUBLIC_REALTIME_URL', 'https://rt.example.test/')
    openPageAt('http://localhost:3000/')
    expect(realtimeHttpUrl('/accounts')).toBe(
      'https://rt.example.test/accounts',
    )
    expect(realtimeWsUrl('/rooms/A/socket')).toBe(
      'wss://rt.example.test/rooms/A/socket',
    )
  })
})
