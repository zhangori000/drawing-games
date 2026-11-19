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
}

export default nextConfig
