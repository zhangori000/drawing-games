import { describe, expect, test } from 'vitest'

import { devOrigins } from './dev-origins'

describe('devOrigins', () => {
  test('allows loopback and this machine’s LAN addresses', () => {
    const origins = devOrigins(
      {
        lo: [
          { address: '127.0.0.1', family: 'IPv4' },
          { address: '::1', family: 'IPv6' },
        ],
        en0: [
          { address: '192.168.1.20', family: 'IPv4' },
          { address: 'FD00::1A2B', family: 'IPv6' },
          { address: 'fe80::1%en0', family: 'IPv6' },
        ],
        utun0: undefined,
      },
      'Laptop',
    )
    expect(origins).toEqual([
      '127.0.0.1',
      '[::1]',
      '192.168.1.20',
      '[fd00::1a2b]',
      'laptop',
      'laptop.local',
    ])
  })

  test('accepts numeric address families from older Node releases', () => {
    expect(
      devOrigins({ eth0: [{ address: '10.0.0.5', family: 4 }] }, ''),
    ).toEqual(['127.0.0.1', '[::1]', '10.0.0.5'])
  })

  test('does not double the mDNS suffix', () => {
    expect(devOrigins({}, 'Studio.local')).toEqual([
      '127.0.0.1',
      '[::1]',
      'studio.local',
    ])
  })
})
