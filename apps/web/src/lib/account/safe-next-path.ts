/**
 * Validates the `?next=` destination used after signing in or up, so a
 * crafted link can never send someone off-site (an open redirect is a
 * credible phishing step here because there is no email-based recovery).
 *
 * The browser's URL parser silently strips tab, LF and CR and treats `\` like
 * `/`, so string prefix checks alone are not enough: `/\t/evil.example`
 * becomes `//evil.example`. We therefore refuse any control character,
 * whitespace or backslash outright, then resolve the value against a sentinel
 * origin and accept it only if it is still on that origin. The returned value
 * is the normalised path + query + hash, never the raw input.
 */
const SENTINEL_ORIGIN = 'http://local.invalid'

// Control characters (C0 + DEL), any Unicode whitespace, and backslashes.
const UNSAFE_CHARACTERS = /[\u0000-\u001F\u007F\s\\]/u
// Percent-encoded slash or backslash: no legitimate in-app destination needs
// one, and some servers/routers decode them into `//host` later.
const ENCODED_SEPARATOR = /%(?:2f|5c)/iu

export function safeNextPath(
  value: string | readonly string[] | undefined | null,
): string | null {
  const next = typeof value === 'string' ? value : value?.[0]
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null
  if (UNSAFE_CHARACTERS.test(next) || ENCODED_SEPARATOR.test(next)) return null

  let url: URL
  try {
    url = new URL(next, SENTINEL_ORIGIN)
  } catch {
    return null
  }
  if (url.origin !== SENTINEL_ORIGIN) return null

  const path = `${url.pathname}${url.search}${url.hash}`
  // Dot segments can collapse into a protocol-relative path
  // (`/a/..//evil.example` resolves to `//evil.example`), so re-check the
  // normalised result rather than trusting the raw prefix check above.
  if (!path.startsWith('/') || path.startsWith('//')) return null
  // Never bounce back to the account page itself (no loops).
  if (url.pathname.startsWith('/account')) return null
  return path
}
