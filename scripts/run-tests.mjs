// Runs the Vitest suite with a time limit (`bun run test`).
//
// A full run takes about 30 seconds. Twice a run has instead sat for 5 to 10
// minutes with one thread of the Vitest process using about 75 % of a core and
// no output, and it could not be reproduced afterwards (ten clean runs in a row).
// A thread stuck in a loop cannot be stopped by Vitest's own timeouts, because
// they need the event loop, so this wrapper watches from outside: past the limit
// it takes a stack sample of the stuck process (macOS), prints where to find it
// and kills the whole process group, instead of leaving a command hanging.
//
// TEST_TIMEOUT_MS changes the limit (default 5 minutes). Other arguments go to
// `vitest run`: `bun run test src/pages/home`, `bun run test --reporter=verbose`.
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const LIMIT_MS = Number(process.env.TEST_TIMEOUT_MS ?? 5 * 60_000)
const vitest = join(import.meta.dirname, '..', 'node_modules', 'vitest', 'vitest.mjs')

// Its own process group, so one signal also reaches the worker processes.
const child = spawn(process.execPath, [vitest, 'run', ...process.argv.slice(2)], {
  stdio: 'inherit',
  detached: process.platform !== 'win32',
})

function killTree(signal) {
  try {
    process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal)
  } catch {
    // Already gone.
  }
}

const watchdog = setTimeout(() => {
  console.error(`\nThe tests did not finish within ${Math.round(LIMIT_MS / 1000)} seconds. Stopping them.`)
  if (process.platform === 'darwin') {
    const sampleFile = join(tmpdir(), `ownledger-test-hang-${Date.now()}.txt`)
    // 3 seconds, every 10 ms: about 10 times smaller than the default of every 1 ms.
    spawnSync('sample', [String(child.pid), '3', '10', '-file', sampleFile], { stdio: 'ignore' })
    console.error(`Where the process was stuck: ${sampleFile}`)
  }
  console.error('Run `bun run test --reporter=verbose` to see which test file was running.')
  killTree('SIGKILL')
  process.exit(1)
}, LIMIT_MS)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    killTree(signal)
    process.exit(1)
  })
}

child.on('exit', (code, signal) => {
  clearTimeout(watchdog)
  process.exit(code ?? (signal ? 1 : 0))
})
