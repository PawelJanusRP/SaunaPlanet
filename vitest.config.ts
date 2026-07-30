import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('./', import.meta.url)).replace(/[\\/]+$/, '')

export default defineConfig({
  resolve: {
    // Mirror the Next.js `@/*` path alias so tests can import application
    // modules (e.g. server actions) for behavioral contract tests.
    alias: { '@': root },
  },
  test: {
    environment: 'node',
    include: ['lib/**/__tests__/**/*.test.ts'],
  },
})
