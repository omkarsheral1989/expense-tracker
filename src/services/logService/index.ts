import { DEBUG_QUERY_PARAMETER, DEBUG_STORAGE_KEY, LOG_PREFIX } from './constants.ts'
import type { ActionLog, LogEntry, Logger, LogFields, LogLevel } from './types.ts'
import { cleanFields, errorFields, idFields, outcomeFields } from './utils.ts'

export type { LogEntry, Logger, LogLevel } from './types.ts'

type Output = (entry: LogEntry) => void

/** Prints to the browser's console, which is where DevTools shows it. */
const consoleOutput: Output = ({ level, scope, message, fields }) => {
  const line = `[${LOG_PREFIX}:${scope}] ${message}`
  if (Object.keys(fields).length > 0) console[level](line, fields)
  else console[level](line)
}

let output: Output = consoleOutput

// A page has these; the service worker has `location` but no storage.
const browser = globalThis as {
  localStorage?: { getItem(key: string): string | null }
  location?: { search?: string }
}

/** True when the debug flag is on: `?debug=1` in the address or `ownledger-debug` = `1` in localStorage. */
function debugEnabled(): boolean {
  try {
    if (browser.localStorage?.getItem(DEBUG_STORAGE_KEY) === '1') return true
  } catch {
    // Storage can be blocked (private windows); the address flag still works.
  }
  try {
    const search = browser.location?.search
    return !!search && new URLSearchParams(search).get(DEBUG_QUERY_PARAMETER) === '1'
  } catch {
    return false
  }
}

function write(level: LogLevel, scope: string, message: string, fields?: LogFields) {
  if (level === 'debug' && !debugEnabled()) return
  output({ level, scope, message, fields: cleanFields(fields) })
}

/**
 * The app's one way to write to the console (ADR-048). Lines are
 * `[ownledger:<scope>] message` with plain fields; names, emails, amounts,
 * free text and tokens never appear. Works in the service worker too.
 */
export const logService = {
  /** The logger for one part of the app, such as `sync` or `database`. */
  scope(scope: string): Logger {
    return {
      debug: (message, fields) => write('debug', scope, message, fields),
      info: (message, fields) => write('info', scope, message, fields),
      warn: (message, fields) => write('warn', scope, message, fields),
      error: (message, fields) => write('error', scope, message, fields),
    }
  },

  /** The fields that describe a failure, for `log.error('…', logService.errorFields(error))`. */
  errorFields,

  /**
   * Wraps the listed functions of a service so each call writes one line when
   * it is done: info when it worked, warn when it refused (a field error, not
   * found), error when it threw (then thrown again). The line carries the ids
   * given, how it ended and how long it took, never the data.
   */
  logActions<T extends object>(log: Logger, service: T, actions: { [K in keyof T]?: ActionLog }): T {
    const wrapped = { ...service } as Record<string, unknown>
    for (const [name, action] of Object.entries(actions) as [string, ActionLog][]) {
      const original = (service as Record<string, (...args: unknown[]) => Promise<unknown>>)[name]
      wrapped[name] = async (...args: unknown[]) => {
        const startedAt = Date.now()
        const ids = idFields(args, action.params)
        try {
          const result = await original(...args)
          const outcome = outcomeFields(result)
          const fields = { ...ids, ...outcome, ms: Date.now() - startedAt }
          if (outcome.ok) log.info(action.message, fields)
          else log.warn(`${action.message}: refused`, fields)
          return result
        } catch (error) {
          log.error(`${action.message}: failed`, { ...ids, ...errorFields(error), ms: Date.now() - startedAt })
          throw error
        }
      }
    }
    return wrapped as T
  },

  /**
   * Replaces where lines go (the tests' setup silences them, and tests read
   * them with `captureLogs`). `null` goes back to the console.
   */
  setOutput(next: Output | null) {
    output = next ?? consoleOutput
  },

  /**
   * Logs uncaught errors and rejected promises, which would otherwise only
   * show in the console without the app's prefix or context. Returns a
   * function that removes the listeners.
   */
  watchGlobalErrors(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>) {
    const log = logService.scope('app')
    const onError = (event: Event) => {
      const { error, message } = event as ErrorEvent
      log.error('Uncaught error', error ? errorFields(error) : { reason: message })
    }
    const onRejection = (event: Event) => {
      log.error('Unhandled promise rejection', errorFields((event as PromiseRejectionEvent).reason))
    }
    target.addEventListener('error', onError)
    target.addEventListener('unhandledrejection', onRejection)
    return () => {
      target.removeEventListener('error', onError)
      target.removeEventListener('unhandledrejection', onRejection)
    }
  },
}
