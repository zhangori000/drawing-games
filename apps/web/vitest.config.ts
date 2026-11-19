import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * Unit tests for framework-free web code (connection, canvas, storage,
 * play helpers). Browser flows live in the root `e2e/` Playwright suite.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '.next/**', 'e2e/**', '../../e2e/**'],
  },
})
