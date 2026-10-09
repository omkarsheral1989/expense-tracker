import { availableParallelism } from 'node:os'
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
    // Every page test file starts its own in-memory PGlite (WebAssembly) in a
    // beforeAll hook. When many files start at once that takes far longer than
    // the default 10 s, and the whole file then fails without running a test.
    hookTimeout: 60_000,
    // Vitest starts about one worker per core. On a laptop that means more busy
    // workers than fast cores, and the whole run gets slower, not faster
    // (measured on an 8-core M1: 4 workers took about 35 s, 7 took about 65 s).
    // Half the cores, in threads (cheaper to start than processes).
    pool: 'threads',
    maxWorkers: Math.max(2, Math.floor(availableParallelism() / 2)),
  },
})
