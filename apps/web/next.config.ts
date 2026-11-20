import { hostname, networkInterfaces } from 'node:os'

import type { NextConfig } from 'next'

import { devOrigins } from './src/lib/dev-origins'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@drawing-games/drawing-model',
    '@drawing-games/game-core',
    '@drawing-games/protocol',
    '@drawing-games/word-bank',
  ],
  // `next dev` only: lets phones on the same Wi-Fi play via
  // http://<laptop-ip>:3000 (see src/lib/dev-origins.ts).
  allowedDevOrigins: devOrigins(networkInterfaces(), hostname()),
  // `next dev` only: the route indicator is pinned to a screen corner, and on
  // a phone every corner holds a game control (bottom-left is the compact
  // keyboard's Backspace; the top corners are Back and the scores). Compile
  // and runtime errors still show in the dev overlay.
  devIndicators: false,
}

export default nextConfig
