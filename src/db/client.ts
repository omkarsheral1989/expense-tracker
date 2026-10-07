import { PGlite } from '@electric-sql/pglite'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import { runMigrations } from './migrate.ts'
import * as schema from './schema.ts'

export type Database = PgliteDatabase<typeof schema>

/**
 * Wraps a PGlite instance with Drizzle and brings its schema up to date.
 * `openDatabase` uses it for the real database; tests pass an in-memory one.
 */
export async function createDatabase(pg: PGlite): Promise<Database> {
  await pg.waitReady
  await runMigrations(pg)
  return drizzle({ client: pg, schema })
}

type OpenDatabase = {
  accountId: string
  pg: PGlite
  database: Promise<Database>
}

// The one database that is open: the signed-in account's.
let current: OpenDatabase | null = null

/**
 * Opens the database of one Google account. Each account on a device has its
 * own, stored in IndexedDB. Calling it again for the same account returns the
 * same database. Only one account can be open at a time.
 */
export function openDatabase(accountId: string): Promise<Database> {
  if (current) {
    if (current.accountId === accountId) return current.database
    throw new Error('Close the open database before opening another account.')
  }

  const pg = new PGlite(`idb://ownledger-${accountId}`)
  const database = createDatabase(pg)
  const opened: OpenDatabase = { accountId, pg, database }
  current = opened

  // If opening fails, forget it so the next call can try again.
  database.catch(() => {
    if (current === opened) current = null
  })
  return database
}

/** The open database. The only way the rest of the app reaches the data. */
export function getDb(): Promise<Database> {
  return current
    ? current.database
    : Promise.reject(new Error('The database is not open. Sign in first.'))
}

/** Closes the open database, for example on sign-out. */
export async function closeDatabase() {
  const closing = current
  current = null
  if (!closing) return
  await closing.database.catch(() => undefined)
  await closing.pg.close()
}
