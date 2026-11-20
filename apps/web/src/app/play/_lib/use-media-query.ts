'use client'

import { useCallback, useSyncExternalStore } from 'react'

const serverFalse = () => false

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  )
  return useSyncExternalStore(subscribe, getSnapshot, serverFalse)
}

/**
 * Side-by-side play layout (canvas left, sidebar right) on desktops and on
 * landscape phones/tablets. Uses aspect ratio rather than orientation so an
 * Android keyboard shrinking a portrait screen does not flip the layout.
 */
const WIDE_LAYOUT_QUERY =
  '(min-width: 1024px), (min-aspect-ratio: 4/3) and (pointer: coarse) and (min-width: 560px)'

export function useWideLayout(): boolean {
  return useMediaQuery(WIDE_LAYOUT_QUERY)
}

/**
 * Phone-sized screens in either orientation: narrower than Tailwind's `sm`
 * or shorter than a landscape phone. Screens use it to trade decoration for
 * content (e.g. compact draft rows so all cards fit without scrolling).
 */
const COMPACT_SCREEN_QUERY = '(max-width: 639px), (max-height: 559px)'

export function useCompactScreen(): boolean {
  return useMediaQuery(COMPACT_SCREEN_QUERY)
}
