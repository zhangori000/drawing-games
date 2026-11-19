'use client'

import { useCallback, useSyncExternalStore } from 'react'

const serverNow = () => 0

/**
 * The current time, rounded down to `stepMs` so components re-render only
 * when relative labels ("5 min ago") can change. Returns 0 during server
 * rendering.
 */
export function useNow(stepMs = 30_000): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const id = window.setInterval(onChange, stepMs)
      return () => window.clearInterval(id)
    },
    [stepMs],
  )
  const getSnapshot = useCallback(
    () => Math.floor(Date.now() / stepMs) * stepMs,
    [stepMs],
  )
  return useSyncExternalStore(subscribe, getSnapshot, serverNow)
}
