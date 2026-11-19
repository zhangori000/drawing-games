const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

/**
 * Random opaque id from `[A-Za-z0-9_-]` (the protocol's opaque id alphabet).
 *
 * `crypto.randomUUID` only exists in secure contexts, and phones on the same
 * Wi-Fi open the dev server over plain `http://<laptop-ip>:3000`, so this uses
 * `getRandomValues`, which works everywhere.
 */
export function randomId(length = 22): string {
  const bytes = new Uint8Array(length)
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let index = 0; index < length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  let id = ''
  for (const byte of bytes) id += ALPHABET[byte & 63]
  return id
}
