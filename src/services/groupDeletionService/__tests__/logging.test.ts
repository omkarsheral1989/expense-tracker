import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { dataChanges } from '../../../db/changes.ts'
import { addTestExpense, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { captureLogs } from '../../../testing/logs.ts'
import { groupDeletionService } from '../index.ts'

let pg: PGlite
let db: Database
const logs = captureLogs()
const heard = vi.fn()
let stop: () => void

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})
afterAll(() => pg.close())
beforeEach(async () => {
  await pg.exec('truncate expense_photos, expense_shares, expenses, group_members, groups, people, event_arrivals cascade')
  logs.clear()
  stop = dataChanges.subscribe(heard)
})
afterEach(() => {
  stop()
  heard.mockReset()
})

const omkar = { email: 'omkar@gmail.com', name: 'Omkar Sheral' }

async function setUp(name = 'Secret surprise party') {
  const group = await createTestGroup(db, omkar, { name, type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
  if (!group.ok) throw new Error('group')
  return { groupId: group.groupId, userId: await personIdOf(db, omkar.email) }
}

describe('deleting and restoring a group are logged, with ids and no names', () => {
  it('logs both actions', async () => {
    const { groupId, userId } = await setUp()
    logs.clear()

    await groupDeletionService.deleteGroup(db, userId, groupId)
    await groupDeletionService.restoreGroup(db, userId, groupId)

    expect(logs.lines.map((line) => [line.level, line.scope, line.message])).toEqual([
      ['info', 'group', 'Group deleted on this device'],
      ['info', 'group', 'Group restored on this device'],
    ])
    expect(logs.lines[0].fields).toMatchObject({ userId, groupId, ok: true })
    const text = JSON.stringify(logs.lines)
    for (const secret of ['Secret surprise', 'Priya', 'priya@gmail.com', 'GBP']) expect(text).not.toContain(secret)
  })

  it('warns when a group is refused, and says it was because it is not settled up, without naming anyone', async () => {
    const { groupId, userId } = await setUp()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000 })
    logs.clear()

    await groupDeletionService.deleteGroup(db, userId, groupId)

    expect(logs.lines[0]).toMatchObject({ level: 'warn', message: 'Group deleted on this device: refused' })
    expect(JSON.stringify(logs.lines)).not.toContain('Priya')
  })

  it('logs the check after a sync, with no names', async () => {
    const { groupId, userId } = await setUp()
    await groupDeletionService.deleteGroup(db, userId, groupId)
    logs.clear()

    await groupDeletionService.restoreIfChanged(db, userId, groupId)

    expect(logs.lines.map((line) => line.message)).toEqual(['Group checked for changes after deleting'])
  })
})

describe('deleting and restoring a group tell the app the data changed', () => {
  it('announces after deleting and restoring, once each', async () => {
    const { groupId, userId } = await setUp()
    heard.mockReset()

    await groupDeletionService.deleteGroup(db, userId, groupId)
    expect(heard).toHaveBeenCalledTimes(1)
    await groupDeletionService.restoreGroup(db, userId, groupId)
    expect(heard).toHaveBeenCalledTimes(2)
  })

  it('announces nothing when it is refused', async () => {
    const { groupId, userId } = await setUp()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000 })
    heard.mockReset()

    await groupDeletionService.deleteGroup(db, userId, groupId)
    await groupDeletionService.restoreGroup(db, userId, groupId)

    expect(heard).not.toHaveBeenCalled()
  })

  it('does not announce the check after a sync: the sync announces when it ends', async () => {
    const { groupId, userId } = await setUp()
    await groupDeletionService.deleteGroup(db, userId, groupId)
    heard.mockReset()

    await groupDeletionService.restoreIfChanged(db, userId, groupId)

    expect(heard).not.toHaveBeenCalled()
  })
})
