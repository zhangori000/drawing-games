import type { Viewport } from 'next'

/**
 * Viewport for play routes: `export const viewport = gameViewport` from the
 * route's layout. Content resizes for the on-screen keyboard (Android) and
 * extends under notches (insets are padded by `GameViewport`). Page zoom is
 * intentionally *not* disabled; touch guards live in the components.
 */
export const gameViewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f5f0e8',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
}
