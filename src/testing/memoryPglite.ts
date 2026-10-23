import type * as PgliteModule from '@electric-sql/pglite'

type Pglite = InstanceType<typeof PgliteModule.PGlite>

/** The databases made so far, by the path the app asked for. */
const opened = new Map<string, Pglite>()

/**
 * A stand-in for the `@electric-sql/pglite` module for whole-app tests. The
 * app opens its data in IndexedDB (`idb://…`), which takes about 7 s per open on
 * a fake IndexedDB. Here every path is an in-memory database, and asking for
 * the same path again gives the same one with its data, even after the app
 * "closed" it, so a test can close and reopen the app the way a restart does.
 * `forgetDatabases()` really closes them, after each test.
 */
export function memoryPglite(real: typeof PgliteModule): typeof PgliteModule {
  function PGlite(this: unknown, path?: string, options?: object) {
    const key = String(path)
    const existing = opened.get(key)
    if (existing) return existing

    const database = new real.PGlite('memory://', options)
    // The app closes its database when a screen goes; here that must keep the data.
    const close = database.close.bind(database)
    database.close = async () => {}
    ;(database as { reallyClose?: () => Promise<void> }).reallyClose = close
    opened.set(key, database)
    return database
  }
  PGlite.prototype = real.PGlite.prototype
  return { ...real, PGlite: PGlite as unknown as typeof real.PGlite }
}

/** Really closes every database the app opened, so the next test starts with none. */
export async function forgetDatabases() {
  for (const database of opened.values()) await (database as unknown as { reallyClose: () => Promise<void> }).reallyClose()
  opened.clear()
}
