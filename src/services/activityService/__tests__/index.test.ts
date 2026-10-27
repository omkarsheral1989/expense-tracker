import { PGlite } from '@electric-sql/pglite'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { dataChanges } from '../../../db/changes.ts'
import { createDatabase, type Database } from '../../../db/client.ts'
import { eventArrivals, expenseEvents, groupMembers, groups, people, syncStatus } from '../../../db/schema.ts'
import { addTestExpense, addTestSettlement, expenseInput, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { captureLogs, messagesOf } from '../../../testing/logs.ts'
import { backupService } from '../../backupService'
import { expenseService } from '../../expenseService'
import { activityService } from '../index.ts'

// Two devices: Omkar's (`a`) and Priya's (`b`); a member's file carries the group from one to the other.
let pgA: PGlite
let pgB: PGlite
let a: Database
let b: Database
const logs = captureLogs()

const TABLES = 'expense_photos, expense_shares, expenses, group_members, groups, people, sync_status'

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
  await pgA.exec(`truncate ${TABLES} cascade`)
  await pgB.exec(`truncate ${TABLES} cascade`)
})

const omkar = { email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const priya = { email: 'priya@gmail.com', name: 'Priya Shah' }

/** Lets the clock move on, since events are ordered by time. */
const pause = () => new Promise((resolve) => setTimeout(resolve, 5))

/** On device A: a group of Omkar and Priya. */
async function omkarsGroup(name = 'Goa trip') {
  const group = await createTestGroup(a, omkar, { name, type: 'trip', defaultCurrency: 'GBP', memberEmails: [priya.email] })
  if (!group.ok) throw new Error('group')
  // The test helper saves people without a name; Priya has hers (names are not what the group decides).
  await a.update(people).set({ name: priya.name }).where(eq(people.email, priya.email))
  return { groupId: group.groupId, omkarId: await personIdOf(a, omkar.email), priyaId: await personIdOf(a, priya.email) }
}

/** Carries the group from A to B as a member's file, as a group sync does. */
async function carryToB(groupId: string, writtenBy: string) {
  const file = await backupService.exportGroup(a, groupId, writtenBy)
  return backupService.importGroup(b, file)
}

describe('listActivity', () => {
  it('lists the events of the user’s groups, newest first, with the group and the expense as it was', async () => {
    const { groupId, omkarId } = await omkarsGroup()
    const dinner = await addTestExpense(a, omkar.email, groupId, { description: 'Dinner', amountMinor: 3000 })
    await pause()
    await addTestExpense(a, omkar.email, groupId, { description: 'Taxi', amountMinor: 500, category: 'transport.taxi' })
    await pause()
    const input = await expenseInput(a, omkar.email, groupId, { description: 'Dinner out', amountMinor: 3500 })
    await expenseService.updateExpense(a, omkarId, groupId, dinner, input)

    const { items, next } = await activityService.listActivity(a, omkarId)

    expect(next).toBeNull()
    expect(items.map((item) => [item.entry.kind, item.description])).toEqual([
      ['edited', 'Dinner out'],
      ['added', 'Taxi'],
      ['added', 'Dinner'],
    ])
    expect(items[0]).toMatchObject({ groupId, groupName: 'Goa trip', expenseId: dinner, amountMinor: 3500, currency: 'GBP', payment: null })
    expect(items[0].by).toMatchObject({ isYou: true, name: 'Omkar Sheral' })
    expect(items[0].entry.changes.map((change) => change.field)).toEqual(['description', 'amount'])
    expect(items[1].category).toBe('transport.taxi')
  })

  it('lists deleted, restored and restored-to-a-version events too', async () => {
    const { groupId, omkarId } = await omkarsGroup()
    const expenseId = await addTestExpense(a, omkar.email, groupId)
    await pause()
    await expenseService.deleteExpense(a, omkarId, groupId, expenseId)
    await pause()
    await expenseService.restoreExpense(a, omkarId, groupId, expenseId)
    await pause()
    const added = (await activityService.listActivity(a, omkarId)).items.find((item) => item.entry.kind === 'added')!
    const input = await expenseInput(a, omkar.email, groupId, { description: 'Changed' })
    await expenseService.updateExpense(a, omkarId, groupId, expenseId, input)
    await pause()
    await expenseService.restoreVersion(a, omkarId, groupId, expenseId, added.id)

    const { items } = await activityService.listActivity(a, omkarId)

    expect(items.map((item) => item.entry.kind)).toEqual(['reverted', 'edited', 'restored', 'deleted', 'added'])
    expect(items[0].entry.restoredFromAt).toEqual(added.entry.at)
    expect(items[0].description).toBe('Dinner')
  })

  it('names who paid whom for a payment', async () => {
    const { groupId, omkarId } = await omkarsGroup()
    await addTestSettlement(a, priya.email, omkar.email, groupId, { amountMinor: 4550 })

    const [item] = (await activityService.listActivity(a, omkarId)).items

    expect(item.payment).toMatchObject({ payer: { name: 'Priya Shah', isYou: false }, recipient: { isYou: true } })
    expect(item.amountMinor).toBe(4550)
  })

  it('carries the people an edit’s lines refer to', async () => {
    const { groupId, omkarId, priyaId } = await omkarsGroup()
    const expenseId = await addTestExpense(a, omkar.email, groupId)
    await pause()
    const input = await expenseInput(a, omkar.email, groupId, { paidBy: priyaId })
    await expenseService.updateExpense(a, omkarId, groupId, expenseId, input)

    const [item] = (await activityService.listActivity(a, omkarId)).items

    expect(item.people[priyaId]).toMatchObject({ name: 'Priya Shah', isYou: false })
    expect(item.people[omkarId]).toMatchObject({ isYou: true })
  })

  it('reads in batches that continue where the last ended, with no repeat or gap', async () => {
    const { groupId, omkarId } = await omkarsGroup()
    for (const description of ['One', 'Two', 'Three', 'Four', 'Five']) {
      await addTestExpense(a, omkar.email, groupId, { description })
      await pause()
    }

    const first = await activityService.listActivity(a, omkarId, { limit: 2 })
    const second = await activityService.listActivity(a, omkarId, { limit: 2, after: first.next })
    const third = await activityService.listActivity(a, omkarId, { limit: 2, after: second.next })

    expect(first.items.map((item) => item.description)).toEqual(['Five', 'Four'])
    expect(second.items.map((item) => item.description)).toEqual(['Three', 'Two'])
    expect(third.items.map((item) => item.description)).toEqual(['One'])
    expect(third.next).toBeNull()
  })

  it('has no next batch when exactly a batch is left', async () => {
    const { groupId, omkarId } = await omkarsGroup()
    await addTestExpense(a, omkar.email, groupId)
    await pause()
    await addTestExpense(a, omkar.email, groupId)

    const { items, next } = await activityService.listActivity(a, omkarId, { limit: 2 })

    expect(items).toHaveLength(2)
    expect(next).toBeNull()
  })

  it('does not skip events made in the same instant', async () => {
    const { groupId, omkarId } = await omkarsGroup()
    await addTestExpense(a, omkar.email, groupId, { description: 'One' })
    await addTestExpense(a, omkar.email, groupId, { description: 'Two' })
    await a.update(expenseEvents).set({ occurredAt: new Date('2026-10-20T10:00:00.000Z') })

    const first = await activityService.listActivity(a, omkarId, { limit: 1 })
    const second = await activityService.listActivity(a, omkarId, { limit: 1, after: first.next })

    expect(new Set([first.items[0].id, second.items[0].id]).size).toBe(2)
    expect(second.next).toBeNull()
  })

  it('leaves out groups the user is not in, has left, or that were deleted', async () => {
    const { groupId, omkarId, priyaId } = await omkarsGroup('Goa trip')
    const other = await omkarsGroup('Other')
    await addTestExpense(a, omkar.email, groupId, { description: 'Kept' })
    await addTestExpense(a, omkar.email, other.groupId, { description: 'Left' })
    const third = await createTestGroup(a, { email: 'sam@gmail.com', name: 'Sam' }, { name: 'Sams', type: 'home', defaultCurrency: 'GBP', memberEmails: [] })
    if (!third.ok) throw new Error('group')
    await addTestExpense(a, 'sam@gmail.com', third.groupId, { description: 'Not mine' })
    await a.update(groupMembers).set({ deletedAt: new Date() }).where(and(eq(groupMembers.groupId, other.groupId), eq(groupMembers.personId, omkarId)))

    const { items } = await activityService.listActivity(a, omkarId)
    expect(items.map((item) => item.description)).toEqual(['Kept'])

    await a.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, groupId))
    expect((await activityService.listActivity(a, omkarId)).items).toEqual([])
    // Priya is still in the group Omkar left, so she still sees its events.
    expect((await activityService.listActivity(a, priyaId)).items.map((item) => item.description)).toEqual(['Left'])
  })

  it('is empty with no groups', async () => {
    expect(await activityService.listActivity(a, crypto.randomUUID())).toEqual({ items: [], next: null })
  })
})

describe('events by other members arriving', () => {
  it('records when a member’s file brought an event, and says how many were new', async () => {
    const { groupId, omkarId } = await omkarsGroup()
    await addTestExpense(a, omkar.email, groupId)

    const result = await carryToB(groupId, omkarId)

    expect(result.arrivals).toHaveLength(1)
    expect(result.arrivals[0].actedBy).toBe(omkarId)
    const rows = await b.select().from(eventArrivals)
    expect(rows.map((row) => row.eventId)).toEqual([result.arrivals[0].eventId])
  })

  it('records nothing for an event already on the device, or for the user’s own backup', async () => {
    const { groupId, omkarId } = await omkarsGroup()
    await addTestExpense(a, omkar.email, groupId)
    await carryToB(groupId, omkarId)
    await b.delete(eventArrivals)

    const again = await carryToB(groupId, omkarId)
    expect(again.arrivals).toEqual([])
    expect(await b.select().from(eventArrivals)).toEqual([])

    await pgB.exec('truncate expense_photos, expense_shares, expenses, group_members, groups, people, sync_status cascade')
    const backed = await backupService.importAll(b, await backupService.exportAll(a, omkarId))
    expect(backed.arrivals).toEqual([])
    expect(await b.select().from(eventArrivals)).toEqual([])
  })

  it('does not record the user’s own events written here', async () => {
    const { groupId } = await omkarsGroup()
    await addTestExpense(a, omkar.email, groupId)

    expect(await a.select().from(eventArrivals)).toEqual([])
  })

  it('lists the arrival time with the event', async () => {
    const { groupId, omkarId, priyaId } = await omkarsGroup()
    await addTestExpense(a, omkar.email, groupId)
    await carryToB(groupId, omkarId)

    const [item] = (await activityService.listActivity(b, priyaId)).items

    expect(item.arrivedAt).toBeInstanceOf(Date)
    expect(item.by.isYou).toBe(false)
  })
})

describe('unreadState and markSeen', () => {
  it('has nothing unread with no events', async () => {
    expect(await activityService.unreadState(a, crypto.randomUUID())).toEqual({ seenAt: null, hasUnread: false })
  })

  it('counts everything that arrived on a first visit, and nothing once seen', async () => {
    const { groupId, omkarId, priyaId } = await omkarsGroup()
    await addTestExpense(a, omkar.email, groupId)
    await carryToB(groupId, omkarId)

    expect(await activityService.unreadState(b, priyaId)).toEqual({ seenAt: null, hasUnread: true })

    await activityService.markSeen(b)
    const seen = await activityService.unreadState(b, priyaId)
    expect(seen.hasUnread).toBe(false)
    expect(seen.seenAt).toBeInstanceOf(Date)
  })

  it('counts only events that arrived after the last time seen', async () => {
    const { groupId, omkarId, priyaId } = await omkarsGroup()
    await addTestExpense(a, omkar.email, groupId, { description: 'Old' })
    await carryToB(groupId, omkarId)
    await activityService.markSeen(b)
    await pause()
    await addTestExpense(a, omkar.email, groupId, { description: 'New' })
    await carryToB(groupId, omkarId)

    expect((await activityService.unreadState(b, priyaId)).hasUnread).toBe(true)
    await activityService.markSeen(b)
    expect((await activityService.unreadState(b, priyaId)).hasUnread).toBe(false)
  })

  it('never counts the user’s own events, even ones that arrived from another device', async () => {
    const { groupId, omkarId } = await omkarsGroup()
    await addTestExpense(a, omkar.email, groupId)
    await carryToB(groupId, omkarId)

    // On Omkar's own second device the same events are his own.
    expect((await activityService.unreadState(b, omkarId)).hasUnread).toBe(false)
  })

  it('does not count events of groups the user is not in', async () => {
    const { groupId, omkarId, priyaId } = await omkarsGroup()
    await addTestExpense(a, omkar.email, groupId)
    await carryToB(groupId, omkarId)
    await b.update(groupMembers).set({ deletedAt: new Date() }).where(eq(groupMembers.personId, priyaId))

    expect((await activityService.unreadState(b, priyaId)).hasUnread).toBe(false)
  })

  it('keeps the time in sync_status under its own scope, replacing it each time', async () => {
    await activityService.markSeen(a)
    await pause()
    await activityService.markSeen(a)

    const rows = await a.select().from(syncStatus).where(eq(syncStatus.scope, 'activity-seen'))
    expect(rows).toHaveLength(1)
  })

  it('does not announce a change: the page the user just left must stay remembered', async () => {
    let heard = 0
    const stop = dataChanges.subscribe(() => heard++)
    await activityService.markSeen(a)
    stop()

    expect(heard).toBe(0)
  })
})

describe('logging', () => {
  it('logs marking seen with a count of nothing personal', async () => {
    await activityService.markSeen(a)

    expect(messagesOf(logs.lines)).toContain('activity: Activity marked as seen')
  })
})
