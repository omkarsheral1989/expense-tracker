import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import { createDatabase, type Database } from '../db/client.ts'
import { testDatabase } from './currentDatabase.ts'

/**
 * Gives a test file a fresh, empty in-memory database: created once for the
 * file, emptied before each test, closed afterwards. Returns it for setting up
 * data. The test file must also point `getDb` at it, which takes a mock of the
 * database client; see the note at the end of this file for the lines to copy.
 */
export function setUpTestDatabase() {
  let pg: PGlite

  beforeAll(async () => {
    pg = new PGlite()
    testDatabase.current = await createDatabase(pg)
  })

  beforeEach(() => pg.exec('truncate group_members, groups, people cascade'))

  afterAll(async () => {
    testDatabase.current = null
    await pg.close()
  })

  return {
    get db(): Database {
      if (!testDatabase.current) throw new Error('The test database is not ready yet.')
      return testDatabase.current
    },
  }
}

/*
 * Pointing `getDb` at the test database. `vi.mock` must be written in the test
 * file itself (it is hoisted above the imports), so copy this into it:
 *
 *   vi.mock('<path to>/db/client.ts', async (importOriginal) => {
 *     const { testDatabase } = await import('<path to>/testing/currentDatabase.ts')
 *     return {
 *       ...(await importOriginal<typeof import('<path to>/db/client.ts')>()),
 *       getDb: vi.fn(async () => testDatabase.current!),
 *     }
 *   })
 *
 * `getDb` is then a mock function, so a test can make one call slow or failing
 * with `vi.mocked(getDb).mockImplementationOnce(...)`.
 */
