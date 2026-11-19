import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@drawing-games/drawing-model',
    '@drawing-games/game-core',
    '@drawing-games/protocol',
    '@drawing-games/word-bank',
  ],
}

export default nextConfig
