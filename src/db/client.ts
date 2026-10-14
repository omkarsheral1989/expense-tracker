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
  datasetId: string
  pg: PGlite
  database: Promise<Database>
}

// The one database that is open: this device's data.
let current: OpenDatabase | null = null

/**
 * Opens the device's one set of data, stored in IndexedDB under its dataset id
 * (a Google account's id for data made before guests existed, otherwise a
 * random one, ADR-035). Calling it again for the same dataset returns the same
 * database. Only one can be open at a time.
 */
export function openDatabase(datasetId: string): Promise<Database> {
  if (current) {
    if (current.datasetId === datasetId) return current.database
    throw new Error('Close the open database before opening another one.')
  }

  const pg = new PGlite(`idb://ownledger-${datasetId}`)
  const database = createDatabase(pg)
  const opened: OpenDatabase = { datasetId, pg, database }
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
