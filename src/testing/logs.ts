import { afterEach } from 'vitest'
import { logService, type LogEntry } from '../services/logService'

/**
 * Collects the log lines written while a test runs (they are otherwise
 * dropped in tests) and stops collecting after each test. Call it at the top
 * of a test file, then read `lines` in the tests.
 */
export function captureLogs(): { lines: LogEntry[]; clear: () => void } {
  const lines: LogEntry[] = []
  logService.setOutput((entry) => lines.push(entry))
  afterEach(() => {
    lines.length = 0
  })
  return { lines, clear: () => void (lines.length = 0) }
}

/** The "scope: message" of each line, which is what tests usually compare. */
export function messagesOf(lines: LogEntry[]): string[] {
  return lines.map((line) => `${line.scope}: ${line.message}`)
}
