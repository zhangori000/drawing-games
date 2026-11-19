/**
 * Defensive wrappers around Web Storage. Storage can be missing (server
 * render, tests), disabled (Safari private mode, embedded webviews), or full;
 * every helper degrades to "nothing stored" instead of throwing.
 */
export type StorageArea = 'local' | 'session'

function area(kind: StorageArea): Storage | null {
  try {
    const storage =
      kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage
    return storage ?? null
  } catch {
    return null
  }
}

export function readString(kind: StorageArea, key: string): string | null {
  try {
    return area(kind)?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeString(
  kind: StorageArea,
  key: string,
  value: string,
): void {
  try {
    area(kind)?.setItem(key, value)
  } catch {
    // Quota or privacy mode: the app keeps working without persistence.
  }
}

export function removeKey(kind: StorageArea, key: string): void {
  try {
    area(kind)?.removeItem(key)
  } catch {
    // Ignore: see writeString.
  }
}

export function readJson(kind: StorageArea, key: string): unknown {
  const raw = readString(kind, key)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export function writeJson(
  kind: StorageArea,
  key: string,
  value: unknown,
): void {
  writeString(kind, key, JSON.stringify(value))
}

export function listKeys(kind: StorageArea): string[] {
  const storage = area(kind)
  if (!storage) return []
  try {
    const keys: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key !== null) keys.push(key)
    }
    return keys
  } catch {
    return []
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
