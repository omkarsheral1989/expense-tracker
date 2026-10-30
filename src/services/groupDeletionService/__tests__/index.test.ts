import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { eventArrivals, expenseEvents, groupDeletions, groupMembers, groups, people } from '../../../db/schema.ts'
import { addTestExpense, addTestSettlement, expenseInput, personIdOf } from '../../../testing/expenses.ts'
import { addTestPerson, createTestGroup } from '../../../testing/groups.ts'
import { activityService } from '../../activityService'
import { balancesService } from '../../balancesService'
import { expenseService } from '../../expenseService'
import { groupService } from '../../groupService'
import { totalsService } from '../../totalsService'
import { groupDeletionService } from '../index.ts'

let pg: PGlite
let db: Database

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})
afterAll(() => pg.close())
beforeEach(() => pg.exec('truncate expense_photos, expense_shares, expenses, group_members, groups, people, event_arrivals cascade'))

const omkar = { email: 'omkar@gmail.com', name: 'Omkar Sheral' }

/** Omkar's "Goa trip" with Priya, and no expenses yet: settled. */
async function setUp(name = 'Goa trip') {
  const group = await createTestGroup(db, omkar, { name, type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
  if (!group.ok) throw new Error('group')
  await db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
  return { groupId: group.groupId, omkarId: await personIdOf(db, omkar.email), priyaId: await personIdOf(db, 'priya@gmail.com') }
}

/** A group of the user's, put in the way a sync brings one in: past the same-name check of `createGroup`. */
async function arrives(userId: string, name: string) {
  const [group] = await db.insert(groups).values({ name, type: 'home', defaultCurrency: 'GBP', createdBy: userId, updatedBy: userId }).returning({ id: groups.id })
  await db.insert(groupMembers).values({ groupId: group.id, personId: userId, updatedBy: userId })
  return group.id
}

const live = (userId: string) => groupService.listGroups(db, userId).then((list) => list.map((group) => group.name))
const deletions = () => db.select().from(groupDeletions)

describe('deleteGroup', () => {
  it('hides a settled group from the user\'s list on this device, and keeps it as a deleted group', async () => {
    const { groupId, omkarId } = await setUp()

    expect(await groupDeletionService.deleteGroup(db, omkarId, groupId)).toEqual({ ok: true })

    expect(await live(omkarId)).toEqual([])
    const [deleted] = await groupService.listGroups(db, omkarId, 'deleted')
    expect(deleted).toMatchObject({ id: groupId, name: 'Goa trip', memberCount: 2 })
    expect(deleted.deletedSince).toBeInstanceOf(Date)
    expect((await groupService.listGroups(db, omkarId, 'all')).map((group) => group.id)).toEqual([groupId])
  })

  it('changes nothing in the group itself, so nothing about it reaches anyone else', async () => {
    const { groupId, omkarId, priyaId } = await setUp()
    const before = (await db.select().from(groups).where(eq(groups.id, groupId)))[0]
    const membersBefore = await db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId))

    await groupDeletionService.deleteGroup(db, omkarId, groupId)

    expect((await db.select().from(groups).where(eq(groups.id, groupId)))[0]).toEqual(before)
    expect(await db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId))).toEqual(membersBefore)
    // The private row says who deleted it and when; it is the only thing written.
    const [row] = await deletions()
    expect(row).toMatchObject({ groupId, updatedBy: omkarId, deletedAt: null })
    expect(priyaId).not.toBe(omkarId)
  })

  it('refuses a group where someone still owes something, and says who owes whom', async () => {
    const { groupId, omkarId, priyaId } = await setUp()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000 })

    const result = await groupDeletionService.deleteGroup(db, omkarId, groupId)

    expect(result).toMatchObject({ ok: false, notSettled: true })
    if (!result.ok && result.notSettled) {
      expect(result.balances.currencies[0].transfers).toEqual([{ fromId: priyaId, toId: omkarId, amountMinor: 1500 }])
    }
    expect(await live(omkarId)).toEqual(['Goa trip'])
    expect(await deletions()).toEqual([])
  })

  it('deletes it once the payments have settled everything', async () => {
    const { groupId, omkarId } = await setUp()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000 })
    await addTestSettlement(db, 'priya@gmail.com', omkar.email, groupId, { amountMinor: 1500 })

    expect(await groupDeletionService.deleteGroup(db, omkarId, groupId)).toEqual({ ok: true })
  })

  it('looks at every currency: a currency that is still owed holds the group back', async () => {
    const { groupId, omkarId } = await setUp()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000, currency: 'GBP' })
    await addTestSettlement(db, 'priya@gmail.com', omkar.email, groupId, { amountMinor: 1500, currency: 'GBP' })
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 1000, currency: 'USD' })

    expect(await groupDeletionService.deleteGroup(db, omkarId, groupId)).toMatchObject({ ok: false, notSettled: true })
  })

  it('counts an expense that was deleted as settled, and a group of one as always settled', async () => {
    const solo = await createTestGroup(db, omkar, { name: 'Solo', type: 'other', defaultCurrency: 'GBP', memberEmails: [] })
    if (!solo.ok) throw new Error('group')
    const omkarId = await personIdOf(db, omkar.email)
    await addTestExpense(db, omkar.email, solo.groupId, { amountMinor: 2000 })

    expect(await groupDeletionService.deleteGroup(db, omkarId, solo.groupId)).toEqual({ ok: true })
  })

  it('says not found for an unknown or malformed id, a group the user is not in, and a group already deleted here', async () => {
    const { groupId, omkarId } = await setUp()
    const stranger = await createTestGroup(db, { email: 'zed@gmail.com', name: 'Zed' }, { name: 'Zed\'s', type: 'home', defaultCurrency: 'GBP', memberEmails: [] })
    if (!stranger.ok) throw new Error('group')

    expect(await groupDeletionService.deleteGroup(db, omkarId, 'not-an-id')).toEqual({ ok: false, notFound: true })
    expect(await groupDeletionService.deleteGroup(db, omkarId, crypto.randomUUID())).toEqual({ ok: false, notFound: true })
    expect(await groupDeletionService.deleteGroup(db, omkarId, stranger.groupId)).toEqual({ ok: false, notFound: true })
    await groupDeletionService.deleteGroup(db, omkarId, groupId)
    expect(await groupDeletionService.deleteGroup(db, omkarId, groupId)).toEqual({ ok: false, notFound: true })
  })

  it('deletes again after a restore, in the same row, with a new time', async () => {
    const { groupId, omkarId } = await setUp()
    await groupDeletionService.deleteGroup(db, omkarId, groupId)
    const [first] = await deletions()
    await groupDeletionService.restoreGroup(db, omkarId, groupId)

    await groupDeletionService.deleteGroup(db, omkarId, groupId)

    const rows = await deletions()
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(first.id)
    expect(rows[0].deletedAt).toBeNull()
    expect(rows[0].since.getTime()).toBeGreaterThanOrEqual(first.since.getTime())
  })
})

describe('what a deleted group is hidden from, and what can still read it', () => {
  it('opens no form for it: getGroup is empty unless the read-only view asks for it', async () => {
    const { groupId, omkarId } = await setUp()
    await groupDeletionService.deleteGroup(db, omkarId, groupId)

    expect(await groupService.getGroup(db, omkarId, groupId)).toBeNull()
    const read = await groupService.getGroup(db, omkarId, groupId, { includeDeleted: true })
    expect(read).toMatchObject({ id: groupId, name: 'Goa trip' })
    expect(read?.deletedSince).toBeInstanceOf(Date)
  })

  it('has no deletedSince for a group on the list', async () => {
    const { groupId, omkarId } = await setUp()

    expect((await groupService.getGroup(db, omkarId, groupId, { includeDeleted: true }))?.deletedSince).toBeNull()
    expect((await groupService.listGroups(db, omkarId))[0].deletedSince).toBeNull()
  })

  it('still lets the balances and the totals be read', async () => {
    const { groupId, omkarId } = await setUp()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000 })
    await addTestSettlement(db, 'priya@gmail.com', omkar.email, groupId, { amountMinor: 1500 })
    await groupDeletionService.deleteGroup(db, omkarId, groupId)

    expect(await balancesService.groupBalances(db, omkarId, groupId)).toMatchObject({ groupId })
    expect(await totalsService.groupTotals(db, omkarId, groupId)).toMatchObject({ groupId })
    expect(await totalsService.hasSpending(db, omkarId, groupId)).toBe(true)
  })

  it('keeps its events in the activity feed and in what is unread', async () => {
    const { groupId, omkarId, priyaId } = await setUp()
    // Priya paid 10.00 and Omkar settled his 5.00 share, so the group is settled; Priya's event reached the device.
    await addTestExpense(db, 'priya@gmail.com', groupId, { amountMinor: 1000, paidBy: priyaId })
    await addTestSettlement(db, omkar.email, 'priya@gmail.com', groupId, { amountMinor: 500 })
    const [event] = await db.select().from(expenseEvents).where(eq(expenseEvents.actedBy, priyaId))
    await db.insert(eventArrivals).values({ eventId: event.id, arrivedAt: new Date() })
    expect((await activityService.listActivity(db, omkarId)).items).toHaveLength(2)
    expect((await activityService.unreadState(db, omkarId)).hasUnread).toBe(true)

    await groupDeletionService.deleteGroup(db, omkarId, groupId)

    expect((await activityService.listActivity(db, omkarId)).items).toHaveLength(2)
    expect((await activityService.unreadState(db, omkarId)).hasUnread).toBe(true)
  })

  it('comes back when the user edits, deletes or restores one of its expenses', async () => {
    const { groupId, omkarId } = await setUp()
    // Paid by Omkar and owed by Omkar alone, so the group stays settled.
    const alone = { method: 'equal' as const, values: { [omkarId]: 1 } }
    const expenseId = await addTestExpense(db, omkar.email, groupId, { amountMinor: 1000, paidBy: omkarId, split: alone })

    for (const change of [
      async () => expenseService.updateExpense(db, omkarId, groupId, expenseId, await expenseInput(db, omkar.email, groupId, { description: 'Lunch', amountMinor: 1000, split: alone })),
      async () => expenseService.deleteExpense(db, omkarId, groupId, expenseId),
      async () => {
        await expenseService.restoreExpense(db, omkarId, groupId, expenseId)
      },
    ]) {
      expect(await groupDeletionService.deleteGroup(db, omkarId, groupId)).toEqual({ ok: true })
      expect(await live(omkarId)).toEqual([])
      await change()
      expect(await live(omkarId)).toEqual(['Goa trip'])
    }
  })

  it('stays deleted when the user only reads one of its expenses', async () => {
    const { groupId, omkarId } = await setUp()
    const expenseId = await addTestExpense(db, omkar.email, groupId, { amountMinor: 1000, paidBy: omkarId, split: { method: 'equal', values: { [omkarId]: 1 } } })
    await groupDeletionService.deleteGroup(db, omkarId, groupId)

    expect(await expenseService.getExpenseToEdit(db, omkarId, groupId, expenseId)).not.toBeNull()
    expect(await live(omkarId)).toEqual([])
  })

  it('keeps its name taken: a new group or a rename to that name is refused until it is restored', async () => {
    const { groupId, omkarId } = await setUp('Goa trip')
    const other = await createTestGroup(db, omkar, { name: 'Other', type: 'home', defaultCurrency: 'GBP', memberEmails: [] })
    if (!other.ok) throw new Error('group')
    await groupDeletionService.deleteGroup(db, omkarId, groupId)

    const created = await groupService.createGroup(db, omkarId, { name: 'goa  TRIP', type: 'trip', defaultCurrency: 'GBP', memberIds: [] })
    const renamed = await groupService.updateGroup(db, omkarId, other.groupId, { name: 'Goa trip', type: 'home', defaultCurrency: 'GBP' })

    expect(created).toMatchObject({ ok: false, errors: { name: 'You already have a group called Goa trip.' } })
    expect(renamed).toMatchObject({ ok: false, errors: { name: 'You already have a group called Goa trip.' } })
  })
})

describe('restoreGroup', () => {
  it('puts the group back on the list, keeping the row (soft) so the history stays', async () => {
    const { groupId, omkarId } = await setUp()
    await groupDeletionService.deleteGroup(db, omkarId, groupId)

    expect(await groupDeletionService.restoreGroup(db, omkarId, groupId)).toEqual({ ok: true })

    expect(await live(omkarId)).toEqual(['Goa trip'])
    expect(await groupService.listGroups(db, omkarId, 'deleted')).toEqual([])
    const [row] = await deletions()
    expect(row.deletedAt).toBeInstanceOf(Date)
    expect(row.updatedBy).toBe(omkarId)
  })

  it('says not found for a group that is not deleted here, an unknown one and one the user is not in', async () => {
    const { groupId, omkarId } = await setUp()

    expect(await groupDeletionService.restoreGroup(db, omkarId, groupId)).toEqual({ ok: false, notFound: true })
    expect(await groupDeletionService.restoreGroup(db, omkarId, 'nope')).toEqual({ ok: false, notFound: true })
    expect(await groupDeletionService.restoreGroup(db, omkarId, crypto.randomUUID())).toEqual({ ok: false, notFound: true })
  })

  it('is refused while another group on the list has its name', async () => {
    const { groupId, omkarId } = await setUp('Goa trip')
    await groupDeletionService.deleteGroup(db, omkarId, groupId)
    // A group of that name made on another device arrives by sync.
    await arrives(omkarId, 'Goa trip')

    expect(await groupDeletionService.restoreGroup(db, omkarId, groupId)).toEqual({ ok: false, message: 'You already have a group called Goa trip.' })
    expect(await live(omkarId)).toEqual(['Goa trip'])
    expect(await groupService.listGroups(db, omkarId, 'deleted')).toHaveLength(1)
  })

  it('is not held back by another group that is itself deleted here', async () => {
    const first = await setUp('Goa trip')
    const second = await arrives(first.omkarId, 'Goa trip')
    await groupDeletionService.deleteGroup(db, first.omkarId, first.groupId)
    await groupDeletionService.deleteGroup(db, first.omkarId, second)

    // Neither is on the list, so neither holds the name until one is restored; the second then finds it taken.
    expect(await groupDeletionService.restoreGroup(db, first.omkarId, first.groupId)).toEqual({ ok: true })
    expect(await groupDeletionService.restoreGroup(db, first.omkarId, second)).toEqual({ ok: false, message: 'You already have a group called Goa trip.' })
  })
})

describe('restoreIfChanged (after a sync)', () => {
  /** Priya adds an expense and it reaches the device `secondsFromNow` seconds from now. */
  async function priyaChanges(groupId: string, priyaId: string, secondsFromNow: number) {
    const expenseId = await addTestExpense(db, 'priya@gmail.com', groupId, { amountMinor: 1000, paidBy: priyaId })
    const [event] = await db.select().from(expenseEvents).where(eq(expenseEvents.expenseId, expenseId))
    await db.insert(eventArrivals).values({ eventId: event.id, arrivedAt: new Date(Date.now() + secondsFromNow * 1000) })
  }

  it('does nothing for a group that is not deleted here', async () => {
    const { groupId, omkarId } = await setUp()

    expect(await groupDeletionService.restoreIfChanged(db, omkarId, groupId)).toEqual({ restored: false })
  })

  it('brings the group back when another member\'s change arrived after it was deleted, and names them', async () => {
    const { groupId, omkarId, priyaId } = await setUp()
    await groupDeletionService.deleteGroup(db, omkarId, groupId)
    await priyaChanges(groupId, priyaId, 5)

    expect(await groupDeletionService.restoreIfChanged(db, omkarId, groupId)).toEqual({ restored: true, changedBy: 'Priya' })

    expect(await live(omkarId)).toEqual(['Goa trip'])
  })

  it('leaves it deleted when the only change arrived before it was deleted', async () => {
    const { groupId, omkarId, priyaId } = await setUp()
    await priyaChanges(groupId, priyaId, -60)
    // Priya paid 10.00, so Omkar owes 5.00: settle it, then delete.
    await addTestSettlement(db, omkar.email, 'priya@gmail.com', groupId, { amountMinor: 500 })
    expect(await groupDeletionService.deleteGroup(db, omkarId, groupId)).toEqual({ ok: true })

    expect(await groupDeletionService.restoreIfChanged(db, omkarId, groupId)).toEqual({ restored: false })
    expect(await live(omkarId)).toEqual([])
  })

  it('ignores the user\'s own events, however late they arrive', async () => {
    const { groupId, omkarId } = await setUp()
    await groupDeletionService.deleteGroup(db, omkarId, groupId)
    const expenseId = await addTestExpense(db, omkar.email, groupId, { amountMinor: 1000 })
    const [event] = await db.select().from(expenseEvents).where(eq(expenseEvents.expenseId, expenseId))
    await db.insert(eventArrivals).values({ eventId: event.id, arrivedAt: new Date(Date.now() + 5000) })

    expect(await groupDeletionService.restoreIfChanged(db, omkarId, groupId)).toEqual({ restored: false })
  })

  it('ignores a change in another group', async () => {
    const { groupId, omkarId, priyaId } = await setUp()
    const other = await createTestGroup(db, omkar, { name: 'Other', type: 'home', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
    if (!other.ok) throw new Error('group')
    await groupDeletionService.deleteGroup(db, omkarId, groupId)
    await priyaChanges(other.groupId, priyaId, 5)

    expect(await groupDeletionService.restoreIfChanged(db, omkarId, groupId)).toEqual({ restored: false })
  })

  it('brings it back when another member added a member after it was deleted', async () => {
    const { groupId, omkarId, priyaId } = await setUp()
    await groupDeletionService.deleteGroup(db, omkarId, groupId)
    const sam = await addTestPerson(db, omkar, { name: 'Sam' })
    const later = new Date(Date.now() + 5000)
    await db.insert(groupMembers).values({ groupId, personId: sam, updatedAt: later, updatedBy: priyaId })

    expect(await groupDeletionService.restoreIfChanged(db, omkarId, groupId)).toEqual({ restored: true, changedBy: 'Priya' })
  })

  it('does not count a member the user added themselves after deleting it', async () => {
    const { groupId, omkarId } = await setUp()
    await groupDeletionService.deleteGroup(db, omkarId, groupId)
    const sam = await addTestPerson(db, omkar, { name: 'Sam' })
    await db.insert(groupMembers).values({ groupId, personId: sam, updatedAt: new Date(Date.now() + 5000), updatedBy: omkarId })

    expect(await groupDeletionService.restoreIfChanged(db, omkarId, groupId)).toEqual({ restored: false })
  })

  it('restores only once: after it, the group is not deleted and nothing is checked', async () => {
    const { groupId, omkarId, priyaId } = await setUp()
    await groupDeletionService.deleteGroup(db, omkarId, groupId)
    await priyaChanges(groupId, priyaId, 5)
    await groupDeletionService.restoreIfChanged(db, omkarId, groupId)

    expect(await groupDeletionService.restoreIfChanged(db, omkarId, groupId)).toEqual({ restored: false })
    expect(await live(omkarId)).toEqual(['Goa trip'])
  })
})
