import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, getDb, openDatabase } from '../client.ts'
import { forgetDatabases } from '../../testing/memoryPglite.ts'

// The app opens `idb://…`; here every path is an in-memory database.
vi.mock('@electric-sql/pglite', async (original) => (await import('../../testing/memoryPglite.ts')).memoryPglite(await original()))

afterEach(async () => {
  await closeDatabase()
  await forgetDatabases()
})

describe('the open database', () => {
  it('cannot be reached before one is opened', async () => {
    await expect(getDb()).rejects.toThrow('The database is not open. Sign in first.')
  })

  it('opens with every migration applied and is then what getDb gives', async () => {
    const db = await openDatabase('data-1')
    expect(await getDb()).toBe(db)
    const rows = await db.execute('select count(*)::int as count from ownledger_migrations')
    expect(rows.rows[0]).toMatchObject({ count: expect.any(Number) })
    expect((rows.rows[0] as { count: number }).count).toBeGreaterThan(10)
  })

  it('gives the same database when the same dataset is opened again', async () => {
    const first = openDatabase('data-1')
    expect(openDatabase('data-1')).toBe(first)
    await first
  })

  it('refuses to open another dataset while one is open', async () => {
    await openDatabase('data-1')
    expect(() => openDatabase('data-2')).toThrow('Close the open database before opening another one.')
  })

  it('can open another dataset once the first is closed', async () => {
    await openDatabase('data-1')
    await closeDatabase()
    await expect(getDb()).rejects.toThrow('not open')
    await expect(openDatabase('data-2')).resolves.toBeDefined()
  })

  it('closing with nothing open is harmless', async () => {
    await expect(closeDatabase()).resolves.toBeUndefined()
  })
})
