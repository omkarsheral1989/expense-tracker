import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so tests do not load the PWA plugin.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/testing/setup.ts'],
    // Page tests type and click through Ant Design in jsdom, which is slow,
    // and slower still when every test file runs at once. The default of 5 s
    // made long flows fail at random on a cold start.
    testTimeout: 20_000,
  },
})
