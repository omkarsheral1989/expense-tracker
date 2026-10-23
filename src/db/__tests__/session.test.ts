import { describe, expect, it } from 'vitest'
import type { Database } from '../client.ts'
import type { DatabaseLock } from '../lock.ts'
import { createSessionManager } from '../session.ts'
import { captureLogs } from '../../testing/logs.ts'

const logs = captureLogs()

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

describe('session manager logging', () => {
  it('logs that the database opened, with how long it took', async () => {
    await setup().manager.start('a')
    expect(logs.lines).toEqual([
      { level: 'info', scope: 'database', message: 'Database opened', fields: { ms: expect.any(Number) } },
    ])
  })

  it('warns when another tab has the data open', async () => {
    await setup({ lockTaken: true }).manager.start('a')
    expect(logs.lines).toEqual([
      { level: 'warn', scope: 'database', message: 'Data is open in another tab', fields: {} },
    ])
  })

  it('logs an error when opening fails', async () => {
    await expect(setup({ openFails: true }).manager.start('a')).rejects.toThrow('boom')
    expect(logs.lines.find((line) => line.level === 'error')).toMatchObject({
      scope: 'database',
      message: 'Database could not be opened',
      fields: { error: 'Error', reason: 'boom' },
    })
  })

  it('never logs the dataset id', async () => {
    await setup().manager.start('a-secret-dataset-id')
    expect(JSON.stringify(logs.lines)).not.toContain('a-secret-dataset-id')
  })
})
