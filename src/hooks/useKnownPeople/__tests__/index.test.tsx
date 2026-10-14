// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestPerson } from '../../../testing/groups.ts'
import { useKnownPeople } from '../index.ts'

// The hook reaches the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const testDb = setUpTestDatabase()
const me = { email: 'omkar@gmail.com', name: 'Omkar' }

describe('useKnownPeople', () => {
  afterEach(() => {
    cleanup()
    vi.mocked(getDb).mockClear()
  })

  it('is loading, then lists the people saved on the device but not the user', async () => {
    await addTestPerson(testDb.db, me, { name: 'Rahul' })
    await addTestPerson(testDb.db, me, { name: 'Priya Shah', email: 'priya@gmail.com' })

    const { result } = renderHook(() => useKnownPeople(me.email))
    expect(result.current).toMatchObject({ loading: true, people: [] })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.people.map((person) => person.name)).toEqual(['Priya Shah', 'Rahul'])
  })

  it('puts a person who has just been saved into the list, in order', async () => {
    await addTestPerson(testDb.db, me, { name: 'Rahul' })
    const { result } = renderHook(() => useKnownPeople(me.email))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.add({ id: 'new-id', name: 'Ann', email: null }))

    expect(result.current.people.map((person) => person.name)).toEqual(['Ann', 'Rahul'])
  })

  it('shows an empty list, not an error, when the database cannot be read', async () => {
    vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))

    const { result } = renderHook(() => useKnownPeople(me.email))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.people).toEqual([])
  })
})
