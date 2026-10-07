import { describe, expect, it } from 'vitest'
import type { Database } from '../client.ts'
import type { DatabaseLock } from '../lock.ts'
import { createSessionManager } from '../session.ts'

const fakeDb = {} as Database

/** A session manager with fake parts, recording what happens and in which order. */
function setup({ lockTaken = false, openFails = false } = {}) {
  const events: string[] = []
  let taken = lockTaken

  const manager = createSessionManager({
    async acquireLock(accountId): Promise<DatabaseLock | null> {
      if (taken) {
        events.push(`lock refused ${accountId}`)
        return null
      }
      taken = true
      events.push(`lock ${accountId}`)
      return {
        release: () => {
          taken = false
          events.push('unlock')
        },
      }
    },
    async open(accountId) {
      events.push(`open ${accountId}`)
      if (openFails) throw new Error('boom')
      return fakeDb
    },
    async close() {
      events.push('close')
    },
  })

  return { manager, events, isLocked: () => taken }
}

describe('session manager', () => {
  it('takes the lock, then opens the database', async () => {
    const { manager, events } = setup()
    await expect(manager.start('a')).resolves.toEqual({ status: 'ready', db: fakeDb })
    expect(events).toEqual(['lock a', 'open a'])
  })

  it('reports locked, without opening, when another tab has the database', async () => {
    const { manager, events } = setup({ lockTaken: true })
    await expect(manager.start('a')).resolves.toEqual({ status: 'locked' })
    expect(events).toEqual(['lock refused a'])
  })

  it('closes the database before it lets go of the lock', async () => {
    const { manager, events, isLocked } = setup()
    await manager.start('a')
    await manager.end()
    expect(events).toEqual(['lock a', 'open a', 'close', 'unlock'])
    expect(isLocked()).toBe(false)
  })

  it('finishes a restart in order: start, end, start', async () => {
    const { manager, events } = setup()
    // Not awaited one by one, the way React's StrictMode fires them.
    const first = manager.start('a')
    const ending = manager.end()
    const second = manager.start('a')
    await Promise.all([first, ending])
    await expect(second).resolves.toEqual({ status: 'ready', db: fakeDb })
    expect(events).toEqual([
      'lock a', 'open a', 'close', 'unlock', 'lock a', 'open a',
    ])
  })

  it('lets go of the lock when opening fails, so a retry can work', async () => {
    const { manager, events, isLocked } = setup({ openFails: true })
    await expect(manager.start('a')).rejects.toThrow('boom')
    expect(events).toEqual(['lock a', 'open a', 'close', 'unlock'])
    expect(isLocked()).toBe(false)
  })

  it('does nothing harmful when ended without having started', async () => {
    const { manager, events } = setup()
    await manager.end()
    expect(events).toEqual(['close'])
  })
})
