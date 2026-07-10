import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@drawing-games/drawing-model',
    '@drawing-games/game-core',
    '@drawing-games/protocol',
  ],
}

export default nextConfig
