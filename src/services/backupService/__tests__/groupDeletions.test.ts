import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { groupDeletions } from '../../../db/schema.ts'
import { personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { groupDeletionService } from '../../groupDeletionService'
import { groupService } from '../../groupService'
import { backupService } from '../index.ts'

// Two devices of the same account: the backup carries which groups were deleted, a member's group file never does (ADR-069).
let pgA: PGlite
let pgB: PGlite
let a: Database
let b: Database

beforeAll(async () => {
  pgA = new PGlite()
  pgB = new PGlite()
  a = await createDatabase(pgA)
  b = await createDatabase(pgB)
})
afterAll(async () => {
  await pgA.close()
  await pgB.close()
})
beforeEach(async () => {
  await pgA.exec('truncate expense_photos, expense_shares, expenses, group_members, groups, people, event_arrivals cascade')
  await pgB.exec('truncate expense_photos, expense_shares, expenses, group_members, groups, people, event_arrivals cascade')
})

const omkar = { email: 'omkar@gmail.com', name: 'Omkar' }

async function setUp() {
  const group = await createTestGroup(a, omkar, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
  if (!group.ok) throw new Error('group')
  return { groupId: group.groupId, userId: await personIdOf(a, omkar.email) }
}

/** Sends device A's backup through JSON to device B, as Drive does. */
async function backUpToB(userId: string) {
  const file = backupService.parse(JSON.stringify(await backupService.exportAll(a, userId)))
  if (!file) throw new Error('refused')
  await backupService.importAll(b, file)
}

describe('which groups were deleted, in the backup', () => {
  it('is in the backup, so a cleared device gets the deletion back', async () => {
    const { groupId, userId } = await setUp()
    await groupDeletionService.deleteGroup(a, userId, groupId)

    await backUpToB(userId)

    expect((await groupService.listGroups(b, userId, 'deleted')).map((group) => group.id)).toEqual([groupId])
    expect(await groupService.listGroups(b, userId)).toEqual([])
  })

  it('leaves a group that is not deleted on the list', async () => {
    const { userId } = await setUp()

    await backUpToB(userId)

    expect((await groupService.listGroups(b, userId)).map((group) => group.name)).toEqual(['Goa trip'])
  })

  it('takes the newer version: a restore made later wins, and an older backup does not delete it again', async () => {
    const { groupId, userId } = await setUp()
    await groupDeletionService.deleteGroup(a, userId, groupId)
    await backUpToB(userId)
    const oldBackup = backupService.parse(JSON.stringify(await backupService.exportAll(a, userId)))
    await groupDeletionService.restoreGroup(a, userId, groupId)
    await backUpToB(userId)
    expect(await groupService.listGroups(b, userId, 'deleted')).toEqual([])

    await backupService.importAll(b, oldBackup!)

    expect(await groupService.listGroups(b, userId, 'deleted')).toEqual([])
    expect((await groupService.listGroups(b, userId)).map((group) => group.id)).toEqual([groupId])
  })

  it('keeps one row per group when the same deletion is merged twice', async () => {
    const { groupId, userId } = await setUp()
    await groupDeletionService.deleteGroup(a, userId, groupId)

    await backUpToB(userId)
    await backUpToB(userId)

    expect(await b.select().from(groupDeletions).where(eq(groupDeletions.groupId, groupId))).toHaveLength(1)
  })

  it('never goes into a member\'s group file, and a group file never changes it', async () => {
    const { groupId, userId } = await setUp()
    await groupDeletionService.deleteGroup(a, userId, groupId)

    const file = await backupService.exportGroup(a, groupId, userId)

    expect(file.rows.groupDeletions).toEqual([])
    expect(JSON.stringify(file)).not.toContain('"since"')
    // A file claiming a deletion is ignored on import.
    const [row] = await a.select().from(groupDeletions)
    const forged = backupService.parseGroupFile(JSON.stringify({ ...file, rows: { ...file.rows, groupDeletions: [{ ...row, since: row.since.toISOString(), updatedAt: row.updatedAt.toISOString(), deletedAt: null }] } }), groupId)
    await backupService.importGroup(b, forged!)
    expect(await b.select().from(groupDeletions)).toEqual([])
  })
})
