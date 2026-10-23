// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { acquireDatabaseLock } from '../lock.ts'

afterEach(() => vi.unstubAllGlobals())

/** A Web Locks API with this lock name taken or free, remembering the requests. */
function stubLocks({ taken = false } = {}) {
  const requests: { name: string; options: object }[] = []
  vi.stubGlobal('navigator', {
    locks: {
      request: (name: string, options: object, callback: (lock: object | null) => Promise<void> | undefined) => {
        requests.push({ name, options })
        const held = callback(taken ? null : {})
        if (held) void held.then(() => {})
        return held
      },
    },
  })
  return { requests }
}

describe('acquireDatabaseLock', () => {
  it('takes a lock named after the dataset, only if it is free', async () => {
    const { requests } = stubLocks()
    const lock = await acquireDatabaseLock('data-1')
    expect(lock).not.toBeNull()
    expect(requests).toEqual([{ name: 'ownledger-database-data-1', options: { ifAvailable: true } }])
  })

  it('gives nothing when another tab holds it', async () => {
    stubLocks({ taken: true })
    expect(await acquireDatabaseLock('data-1')).toBeNull()
  })

  it('keeps the lock until it is released', async () => {
    let settled = false
    vi.stubGlobal('navigator', {
      locks: {
        request: (_name: string, _options: object, callback: (lock: object) => Promise<void>) => {
          void callback({}).then(() => (settled = true))
        },
      },
    })
    const lock = await acquireDatabaseLock('data-1')
    await Promise.resolve()
    expect(settled).toBe(false)
    lock?.release()
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(true)
  })

  it('gives a lock that does nothing in a browser without the Web Locks API', async () => {
    vi.stubGlobal('navigator', {})
    const lock = await acquireDatabaseLock('data-1')
    expect(lock).not.toBeNull()
    expect(() => lock?.release()).not.toThrow()
  })
})
