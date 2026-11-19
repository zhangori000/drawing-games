import { ACCOUNT_TOKEN_PATTERN } from '@drawing-games/protocol'

import { isRecord, readJson, removeKey, writeJson } from '../browser-storage'

/**
 * The quick-account bearer token, kept in localStorage so every tab and room
 * shares one sign-in. It authorizes the account: never log or render it.
 */
export const ACCOUNT_STORAGE_KEY = 'dd.account.v1'
const CHANGE_EVENT = 'dd:account-token'

export function readAccountToken(): string | null {
  const stored = readJson('local', ACCOUNT_STORAGE_KEY)
  const token = isRecord(stored) ? stored.token : null
  return typeof token === 'string' && ACCOUNT_TOKEN_PATTERN.test(token)
    ? token
    : null
}

export function writeAccountToken(token: string): void {
  writeJson('local', ACCOUNT_STORAGE_KEY, { token })
  announce()
}

export function clearAccountToken(): void {
  removeKey('local', ACCOUNT_STORAGE_KEY)
  announce()
}

/** Fires when the token changes in this tab or any other tab. */
export function subscribeAccountToken(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === ACCOUNT_STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGE_EVENT, listener)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGE_EVENT, listener)
  }
}

function announce(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }
}
