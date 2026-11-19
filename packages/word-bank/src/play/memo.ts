/**
 * Memoizes a pure string function. The cache is cleared wholesale once it
 * holds `limit` entries, which keeps memory bounded in a long-lived worker
 * that sees many rooms' custom words.
 */
export function boundedMemo<T>(
  compute: (input: string) => T,
  limit = 4096,
): (input: string) => T {
  const cache = new Map<string, T>()
  return (input) => {
    if (cache.has(input)) return cache.get(input) as T
    const value = compute(input)
    if (cache.size >= limit) cache.clear()
    cache.set(input, value)
    return value
  }
}
