import { expect, test } from 'vitest'

import { safeNextPath } from './safe-next-path'

test('keeps ordinary in-app destinations, normalised', () => {
  expect(safeNextPath('/me')).toBe('/me')
  expect(safeNextPath('/play/ABCD')).toBe('/play/ABCD')
  expect(safeNextPath('/play/ABCD?seat=1#chat')).toBe('/play/ABCD?seat=1#chat')
  expect(safeNextPath(['/me', '/play/X'])).toBe('/me')
  expect(safeNextPath('/./me')).toBe('/me')
})

test('missing or relative values fall back to the default', () => {
  expect(safeNextPath(undefined)).toBeNull()
  expect(safeNextPath(null)).toBeNull()
  expect(safeNextPath('')).toBeNull()
  expect(safeNextPath([])).toBeNull()
  expect(safeNextPath('me')).toBeNull()
})

test.each([
  // Decoded forms of ?next=/%09/…, /%0a/…, /%0d/… (the URL parser strips these).
  '/\t/example.com/pwn',
  '/\n/example.com/pwn',
  '/\r/example.com/pwn',
  '/me\t',
  '/ /example.com',
  '/ /example.com',
  '/\u0000/example.com',
  '/\u007f/example.com',
  // Backslashes are treated like slashes by browsers.
  '/\\example.com',
  '/\\/example.com',
  '\\\\example.com',
  // Protocol-relative and absolute URLs.
  '//example.com',
  '///example.com',
  'https://example.com',
  'http:/example.com',
  'javascript:alert(1)',
  // Encoded separators and dot segments that collapse into `//host`.
  '/%2F%2Fexample.com',
  '/%2f/example.com',
  '/%5C/example.com',
  '/a/..//example.com',
  '/%2e%2e//example.com',
])('refuses off-site or ambiguous destination %j', (value) => {
  expect(safeNextPath(value)).toBeNull()
})

test('never bounces back to the account page', () => {
  expect(safeNextPath('/account')).toBeNull()
  expect(safeNextPath('/account?mode=login')).toBeNull()
  expect(safeNextPath('/account/anything')).toBeNull()
  expect(safeNextPath('/me/../account')).toBeNull()
})
