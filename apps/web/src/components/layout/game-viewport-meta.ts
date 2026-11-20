import type { Viewport } from 'next'

/**
 * Viewport for play routes: `export const viewport = gameViewport` from the
 * route's layout. Content resizes for the on-screen keyboard (Android) and
 * extends under notches (insets are padded by `GameViewport`).
 *
 * Page zoom is intentionally *not* disabled here (no `maximum-scale` or
 * `user-scalable=no`), so browser and accessibility zoom keep working.
 * Pinch and double-tap zoom on the game surface are blocked by
 * `GameViewport` itself (`touch-action: pan-x pan-y` plus Safari gesture
 * guards), and it ignores zoomed visual viewports when pinning the layout.
 */
export const gameViewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f5f0e8',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
}
