import { closeDatabase, openDatabase, type Database } from './client.ts'
import { logService } from '../services/logService'
import { acquireDatabaseLock, type DatabaseLock } from './lock.ts'

const log = logService.scope('database')

export type SessionResult =
  | { status: 'ready'; db: Database }
  /** Another tab already has this data open. */
  | { status: 'locked' }

type SessionDeps = {
  acquireLock: (datasetId: string) => Promise<DatabaseLock | null>
  open: (datasetId: string) => Promise<Database>
  close: () => Promise<void>
}

/**
 * Opens and closes the device's database together with its tab lock.
 *
 * Starts and ends run strictly one after another. React can start, end and
 * start again within a moment (StrictMode in development, or a retry), and a
 * database must be fully closed before the same one is opened again.
 */
export function createSessionManager(deps: SessionDeps) {
  let queue: Promise<unknown> = Promise.resolve()
  let heldLock: DatabaseLock | null = null

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task)
    queue = run.catch(() => undefined)
    return run
  }

  async function stop() {
    log.debug('Closing database')
    await deps.close()
    heldLock?.release()
    heldLock = null
  }

  return {
    /** Takes the lock and opens the database. Rejects if opening fails. */
    start(datasetId: string): Promise<SessionResult> {
      return enqueue(async () => {
        const lock = await deps.acquireLock(datasetId)
        if (!lock) {
          log.warn('Data is open in another tab')
          return { status: 'locked' }
        }

        heldLock = lock
        const startedAt = Date.now()
        try {
          const db = await deps.open(datasetId)
          log.info('Database opened', { ms: Date.now() - startedAt })
          return { status: 'ready', db }
        } catch (error) {
          log.error('Database could not be opened', logService.errorFields(error))
          await stop()
          throw error
        }
      })
    },

    /** Closes the database and lets other tabs use it. Safe to call anytime. */
    end(): Promise<void> {
      return enqueue(stop)
    },
  }
}

/** The app's session: the real lock and the real database. */
export const databaseSession = createSessionManager({
  acquireLock: acquireDatabaseLock,
  open: openDatabase,
  close: closeDatabase,
})
