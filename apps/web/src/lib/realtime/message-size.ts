/**
 * The room server refuses any client message larger than this many UTF-8
 * bytes and closes the socket with 1009 (mirrors `MAX_MESSAGE_BYTES` in
 * apps/realtime/src/room/constants.ts).
 */
export const MAX_CLIENT_MESSAGE_BYTES = 64 * 1024

/** Exact UTF-8 length of a JavaScript string, without allocating a buffer. */
export function utf8ByteLength(text: string): number {
  let bytes = 0
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code < 0x80) {
      bytes += 1
    } else if (code < 0x800) {
      bytes += 2
    } else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < text.length &&
      isLowSurrogate(text.charCodeAt(index + 1))
    ) {
      // A surrogate pair is one code point: four bytes.
      bytes += 4
      index += 1
    } else {
      // Other BMP characters, and lone surrogates (encoded as U+FFFD).
      bytes += 3
    }
  }
  return bytes
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff
}
