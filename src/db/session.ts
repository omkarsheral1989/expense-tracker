import { closeDatabase, openDatabase, type Database } from './client.ts'
import { acquireDatabaseLock, type DatabaseLock } from './lock.ts'

export type SessionResult =
  | { status: 'ready'; db: Database }
  /** Another tab already has this account's database open. */
  | { status: 'locked' }

type SessionDeps = {
  acquireLock: (accountId: string) => Promise<DatabaseLock | null>
  open: (accountId: string) => Promise<Database>
  close: () => Promise<void>
}

/**
 * Opens and closes the account's database together with its tab lock.
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
    await deps.close()
    heldLock?.release()
    heldLock = null
  }

  return {
    /** Takes the lock and opens the database. Rejects if opening fails. */
    start(accountId: string): Promise<SessionResult> {
      return enqueue(async () => {
        const lock = await deps.acquireLock(accountId)
        if (!lock) return { status: 'locked' }

        heldLock = lock
        try {
          return { status: 'ready', db: await deps.open(accountId) }
        } catch (error) {
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
