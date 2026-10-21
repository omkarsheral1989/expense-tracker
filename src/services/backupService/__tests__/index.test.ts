import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { expenseEvents, expenseShares, expenses, groupMembers, groups, people } from '../../../db/schema.ts'
import { addTestExpense, expenseInput, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { expenseService } from '../../expenseService'
import { groupService } from '../../groupService'
import { backupService } from '../index.ts'
import type { BackupFile } from '../types.ts'

// Two devices: `source` makes a backup, `target` restores it.
let sourcePg: PGlite
let targetPg: PGlite
let source: Database
let target: Database

const TABLES = 'expense_photos, expense_shares, expenses, group_members, groups, people, sync_status'

beforeAll(async () => {
  sourcePg = new PGlite()
  targetPg = new PGlite()
  source = await createDatabase(sourcePg)
  target = await createDatabase(targetPg)
})

afterAll(async () => {
  await sourcePg.close()
  await targetPg.close()
})

beforeEach(async () => {
  await sourcePg.exec(`truncate ${TABLES} cascade`)
  await targetPg.exec(`truncate ${TABLES} cascade`)
})

const omkar = { email: 'omkar@gmail.com', name: 'Omkar' }

/** On the source: a group with Priya, an expense, an edited one and a deleted one. */
async function sourceData() {
  const group = await createTestGroup(source, omkar, {
    name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'],
  })
  if (!group.ok) throw new Error('group not created')
  const userId = await personIdOf(source, omkar.email)
  const dinner = await addTestExpense(source, omkar.email, group.groupId, { description: 'Dinner' })
  const taxi = await addTestExpense(source, omkar.email, group.groupId, { description: 'Taxi' })
  const edited = await expenseService.updateExpense(source, userId, group.groupId, dinner, {
    ...(await expenseInput(source, omkar.email, group.groupId)),
    description: 'Beach dinner',
  })
  if (!edited.ok) throw new Error('not edited')
  await expenseService.deleteExpense(source, userId, group.groupId, taxi)
  return { groupId: group.groupId, userId, dinner, taxi }
}

/** A backup of the source, written as JSON and read back, as it travels through Drive. */
async function backupOfSource(): Promise<BackupFile> {
  const { userId } = await sourceIds()
  const file = backupService.parse(JSON.stringify(await backupService.exportAll(source, userId)))
  if (!file) throw new Error('the backup was refused')
  return file
}

async function sourceIds() {
  return { userId: await personIdOf(source, omkar.email) }
}

describe('backupService.exportAll and parse', () => {
  it('holds every row of every table, deleted ones and the history included, and reads back', async () => {
    const { userId, taxi } = await sourceData()

    const file = await backupOfSource()

    expect(file).toMatchObject({ app: 'ownledger', kind: 'backup', format: 1, writtenBy: userId })
    expect(file.rows.people.map((person) => person.email).sort()).toEqual(['omkar@gmail.com', 'priya@gmail.com'])
    expect(file.rows.groups.map((group) => group.name)).toEqual(['Goa trip'])
    expect(file.rows.groupMembers).toHaveLength(2)
    expect(file.rows.expenses).toHaveLength(2)
    expect(file.rows.expenses.find((expense) => expense.id === taxi)?.deletedAt).toBeInstanceOf(Date)
    expect(file.rows.expenseShares).toHaveLength(4)
    // added ×2, edited, deleted
    expect(file.rows.expenseEvents.map((event) => event.kind).sort()).toEqual(['added', 'added', 'deleted', 'edited'])
  })

  it('refuses what is not an OwnLedger backup', async () => {
    await sourceData()
    const good = JSON.parse(JSON.stringify(await backupService.exportAll(source, (await sourceIds()).userId)))

    expect(backupService.parse('not json')).toBeNull()
    expect(backupService.parse(JSON.stringify({ ...good, app: 'other' }))).toBeNull()
    expect(backupService.parse(JSON.stringify({ ...good, format: 2 }))).toBeNull()
    expect(backupService.parse(JSON.stringify({ ...good, rows: { ...good.rows, groups: undefined } }))).toBeNull()
    const badId = { ...good.rows.people[0], id: 'not-a-uuid' }
    expect(backupService.parse(JSON.stringify({ ...good, rows: { ...good.rows, people: [badId] } }))).toBeNull()
    expect(backupService.parse(JSON.stringify(good))).not.toBeNull()
  })
})

describe('backupService.importAll', () => {
  it('brings everything to an empty device: groups, balances, deletions and history', async () => {
    const { groupId, userId, dinner, taxi } = await sourceData()

    await backupService.importAll(target, await backupOfSource())

    expect((await groupService.listGroups(target, userId)).map((group) => group.name)).toEqual(['Goa trip'])
    expect(await expenseService.groupBalances(target, userId, groupId)).toEqual(
      await expenseService.groupBalances(source, userId, groupId),
    )
    const [deleted] = await target.select().from(expenses).where(eq(expenses.id, taxi))
    expect(deleted.deletedAt).not.toBeNull()
    expect((await expenseService.getExpense(target, userId, groupId, dinner))?.history.map((entry) => entry.kind)).toEqual(
      ['edited', 'added'],
    )
  })

  it('keeps what is only on the device', async () => {
    await sourceData()
    const local = await createTestGroup(target, omkar, { name: 'Flat', type: 'home', defaultCurrency: 'INR' })
    if (!local.ok) throw new Error('group not created')

    await backupService.importAll(target, await backupOfSource())

    const userId = await personIdOf(target, omkar.email)
    expect((await groupService.listGroups(target, userId)).map((group) => group.name).sort()).toEqual(['Flat', 'Goa trip'])
  })

  it('keeps the newer version of a row on either side', async () => {
    const { groupId, userId } = await sourceData()
    const file = await backupOfSource()
    await backupService.importAll(target, file)
    // Renamed on the device after the backup: the device's version is newer.
    await target.update(groups).set({ name: 'Goa 2026', updatedAt: new Date(Date.now() + 60_000) }).where(eq(groups.id, groupId))
    await backupService.importAll(target, file)
    expect((await target.select().from(groups))[0].name).toBe('Goa 2026')

    // Renamed in the backup later still: the backup's version is newer.
    const later = structuredClone(file)
    later.rows.groups[0] = { ...later.rows.groups[0], name: 'Goa trip 2026', updatedAt: new Date(Date.now() + 120_000), updatedBy: userId }
    await backupService.importAll(target, later)
    expect((await target.select().from(groups))[0].name).toBe('Goa trip 2026')
  })

  it('changes nothing when the same backup is merged twice', async () => {
    await sourceData()
    const file = await backupOfSource()
    await backupService.importAll(target, file)
    const before = { shares: await target.select().from(expenseShares), events: await target.select().from(expenseEvents) }

    await backupService.importAll(target, file)

    expect(await target.select().from(expenseShares)).toEqual(before.shares)
    expect(await target.select().from(expenseEvents)).toEqual(before.events)
  })

  it('makes the same person in the same group one membership, even with another id', async () => {
    const { groupId } = await sourceData()
    const file = await backupOfSource()
    await backupService.importAll(target, file)
    const priyaId = await personIdOf(target, 'priya@gmail.com')
    // Another device added Priya to the group under a membership id of its own.
    const other = structuredClone(file)
    other.rows.groupMembers = other.rows.groupMembers.map((member) =>
      member.personId === priyaId ? { ...member, id: crypto.randomUUID() } : member,
    )

    await backupService.importAll(target, other)

    const members = await target.select().from(groupMembers).where(eq(groupMembers.groupId, groupId))
    expect(members.filter((member) => member.personId === priyaId)).toHaveLength(1)
  })

  describe('when the device knows the same email under another id', () => {
    /** The target's own person for Omkar, under `id`, with a group of its own. */
    async function targetUser(id: string) {
      await target.insert(people).values({ id, email: omkar.email, name: 'Omkar', updatedBy: id })
      const flat = await groupService.createGroup(target, id, { name: 'Flat', type: 'home', defaultCurrency: 'INR', memberIds: [] })
      if (!flat.ok) throw new Error('group not created')
      return flat.groupId
    }

    it('keeps the device\'s id when it is the smaller one, and points the backup\'s rows at it', async () => {
      const { groupId, userId: backupId } = await sourceData()
      const deviceId = '00000000-0000-4000-8000-000000000001'
      await targetUser(deviceId)

      const { renamed } = await backupService.importAll(target, await backupOfSource())

      expect([...renamed]).toEqual([[backupId, deviceId]])
      expect((await target.select().from(people)).filter((person) => person.email === omkar.email)).toHaveLength(1)
      expect((await groupService.listGroups(target, deviceId)).map((group) => group.name).sort()).toEqual(['Flat', 'Goa trip'])
      const events = await target.select().from(expenseEvents)
      expect(events.every((event) => event.actedBy === deviceId)).toBe(true)
      expect(events.every((event) => !JSON.stringify(event.snapshot).includes(backupId))).toBe(true)
      expect(await expenseService.groupBalances(target, deviceId, groupId)).toHaveLength(1)
    })

    it('moves the device\'s person to the backup\'s id when that is the smaller one', async () => {
      const { userId: backupId } = await sourceData()
      const deviceId = 'ffffffff-ffff-4fff-bfff-ffffffffffff'
      const flat = await targetUser(deviceId)

      const { renamed } = await backupService.importAll(target, await backupOfSource())

      expect([...renamed]).toEqual([[deviceId, backupId]])
      expect(await target.select().from(people).where(eq(people.id, deviceId))).toEqual([])
      const [flatGroup] = await target.select().from(groups).where(eq(groups.id, flat))
      expect(flatGroup.createdBy).toBe(backupId)
      expect((await groupService.listGroups(target, backupId)).map((group) => group.name).sort()).toEqual(['Flat', 'Goa trip'])
    })
  })

  it('brings back a version that was restored, after the version it points at', async () => {
    const { groupId, userId, dinner } = await sourceData()
    const [added] = (await source.select().from(expenseEvents).where(eq(expenseEvents.expenseId, dinner)))
      .filter((event) => event.kind === 'added')
    const reverted = await expenseService.restoreVersion(source, userId, groupId, dinner, added.id)
    if (!reverted.ok) throw new Error('not restored')
    // The backup lists the reverted event first and the event it points at last,
    // with more events between them than one insert takes.
    const file = await backupOfSource()
    const filler = file.rows.expenseEvents.find((event) => event.kind === 'edited')!
    const between = Array.from({ length: 250 }, () => ({ ...filler, id: crypto.randomUUID(), occurredAt: new Date(filler.occurredAt) }))
    file.rows.expenseEvents = [
      ...file.rows.expenseEvents.filter((event) => event.kind === 'reverted'),
      ...between,
      ...file.rows.expenseEvents.filter((event) => event.kind !== 'reverted'),
    ]

    await backupService.importAll(target, file)

    const events = await target.select().from(expenseEvents).where(eq(expenseEvents.expenseId, dinner))
    expect(events.find((event) => event.kind === 'reverted')?.restoredFrom).toBe(added.id)
  })

  it('changes nothing when a row breaks the data\'s rules, such as pointing at a missing person', async () => {
    await sourceData()
    const file = await backupOfSource()
    file.rows.groups[0] = { ...file.rows.groups[0], createdBy: crypto.randomUUID() }

    await expect(backupService.importAll(target, file)).rejects.toThrow()

    expect(await target.select().from(people)).toEqual([])
  })
})

describe('backupService.lastBackedUpAt and recordBackup', () => {
  it('remembers when the last backup finished on this device', async () => {
    expect(await backupService.lastBackedUpAt(target)).toBeNull()

    await backupService.recordBackup(target, new Date('2026-10-21T10:00:00Z'))
    await backupService.recordBackup(target, new Date('2026-10-21T11:00:00Z'))

    expect(await backupService.lastBackedUpAt(target)).toEqual(new Date('2026-10-21T11:00:00Z'))
  })
})
