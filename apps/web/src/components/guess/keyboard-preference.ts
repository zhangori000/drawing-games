'use client'

import { useCallback, useSyncExternalStore } from 'react'

import { readString, writeString } from '@/lib/browser-storage'

export const COMPACT_KEYBOARD_KEY = 'dd.compactKeyboard'
const CHANGE_EVENT = 'dd:compact-keyboard'
const COARSE_POINTER = '(pointer: coarse)'

function subscribe(listener: () => void): () => void {
  const media = window.matchMedia(COARSE_POINTER)
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === COMPACT_KEYBOARD_KEY) listener()
  }
  media.addEventListener('change', listener)
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGE_EVENT, listener)
  return () => {
    media.removeEventListener('change', listener)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGE_EVENT, listener)
  }
}

function isCoarsePointer(): boolean {
  return window.matchMedia(COARSE_POINTER).matches
}

function readPreference(): boolean {
  const stored = readString('local', COMPACT_KEYBOARD_KEY)
  if (stored === '1') return true
  if (stored === '0') return false
  return isCoarsePointer()
}

const serverFalse = () => false

/** True on touch-first devices (phones, tablets). */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, isCoarsePointer, serverFalse)
}

/**
 * Whether to use the in-app keyboard instead of the phone's. Defaults to on
 * for coarse pointers; the choice persists per browser.
 */
export function useCompactKeyboardPreference(): readonly [
  boolean,
  (enabled: boolean) => void,
] {
  const enabled = useSyncExternalStore(subscribe, readPreference, serverFalse)
  const setEnabled = useCallback((next: boolean) => {
    writeString('local', COMPACT_KEYBOARD_KEY, next ? '1' : '0')
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])
  return [enabled, setEnabled] as const
}
