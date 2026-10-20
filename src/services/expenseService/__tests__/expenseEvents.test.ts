import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { expenseEvents, expenses } from '../../../db/schema.ts'
import { addTestExpense, addTestSettlement, expenseInput, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup, type TestUser } from '../../../testing/groups.ts'
import { groupService } from '../../groupService'
import { expenseService } from '../index.ts'
import type { CreateExpenseInput } from '../types.ts'

let pg: PGlite
let db: Database

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})

afterAll(() => pg.close())

beforeEach(() => pg.exec('truncate expense_photos, expense_shares, expenses, group_members, groups, people cascade'))

const omkar: TestUser = { email: 'omkar@gmail.com', name: 'Omkar' }
const priya: TestUser = { email: 'priya@gmail.com', name: 'Priya' }
const sam: TestUser = { email: 'sam@gmail.com', name: 'Sam' }

const dinner: Partial<CreateExpenseInput> = {
  description: 'Dinner',
  category: 'food.dining_out',
  amountMinor: 1000,
  currency: 'INR',
  date: '2026-10-08',
  notes: 'Card',
}

async function createGroup(creator: TestUser, memberEmails: string[] = []) {
  const result = await createTestGroup(db, creator, {
    name: `Group ${crypto.randomUUID().slice(0, 8)}`,
    type: 'trip',
    defaultCurrency: 'INR',
    memberEmails,
  })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.groupId
}

const id = (user: TestUser) => personIdOf(db, user.email)

/** Every event of an expense, oldest first. */
async function eventsOf(expenseId: string) {
  const order = ['added', 'edited', 'deleted', 'restored']
  const rows = await db.select().from(expenseEvents).where(eq(expenseEvents.expenseId, expenseId))
  return rows.toSorted((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || order.indexOf(a.kind) - order.indexOf(b.kind))
}

const kindsOf = async (expenseId: string) => (await eventsOf(expenseId)).map((event) => event.kind)

async function pause() {
  // Events of one expense are told apart by time, so let the clock move on.
  await new Promise((resolve) => setTimeout(resolve, 5))
}

async function edit(user: TestUser, groupId: string, expenseId: string, overrides: Partial<CreateExpenseInput>) {
  const userId = await id(user)
  const saved = await expenseService.getExpenseToEdit(db, userId, groupId, expenseId)
  if (!saved) throw new Error('Not editable.')
  const result = await expenseService.updateExpense(db, userId, groupId, expenseId, {
    description: saved.description,
    category: saved.category,
    amountMinor: saved.amountMinor,
    currency: saved.currency,
    date: saved.date,
    notes: saved.notes ?? '',
    paidBy: saved.paidBy,
    split: saved.split,
    receipts: saved.receipts,
    ...overrides,
  })
  if (!result.ok) throw new Error(JSON.stringify(result))
}

describe('the "added" event', () => {
  it('is recorded when an expense is added: who, when, the group and the expense as saved', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const photo = { id: crypto.randomUUID(), mimeType: 'image/jpeg', sizeBytes: 12 }
    const before = new Date()

    const expenseId = await addTestExpense(db, omkar.email, groupId, { ...dinner, receipts: [photo] })

    const [event, ...others] = await eventsOf(expenseId)
    expect(others).toEqual([])
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    expect(event).toMatchObject({ kind: 'added', groupId, expenseId, actedBy: await id(omkar), changes: [], deletedAt: null })
    expect(event.occurredAt).toEqual(expense.createdAt)
    expect(event.updatedAt).toEqual(event.occurredAt)
    expect(event.updatedBy).toBe(await id(omkar))
    expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(event.snapshot).toEqual({
      description: 'Dinner',
      category: 'food.dining_out',
      amountMinor: 1000,
      currency: 'INR',
      date: '2026-10-08',
      notes: 'Card',
      method: 'equal',
      shares: expect.arrayContaining([
        { personId: await id(omkar), paidMinor: 1000, owedMinor: 500, inputValue: 1 },
        { personId: await id(priya), paidMinor: 0, owedMinor: 500, inputValue: 1 },
      ]),
      photos: [{ ...photo, position: 0 }],
    })
  })

  it('is recorded for a payment too, as a settlement', async () => {
    const groupId = await createGroup(omkar, [priya.email])

    const payment = await addTestSettlement(db, omkar.email, priya.email, groupId, { amountMinor: 700, currency: 'INR' })

    const [event] = await eventsOf(payment)
    expect(event.kind).toBe('added')
    expect(event.snapshot.category).toBe('settlement')
    expect(event.snapshot.shares).toEqual(
      expect.arrayContaining([
        { personId: await id(omkar), paidMinor: 700, owedMinor: 0, inputValue: 0 },
        { personId: await id(priya), paidMinor: 0, owedMinor: 700, inputValue: 700 },
      ]),
    )
  })

  it('is not recorded when the expense is refused', async () => {
    const groupId = await createGroup(omkar)
    const input = await expenseInput(db, omkar.email, groupId, { ...dinner, description: '   ' })

    const result = await expenseService.createExpense(db, await id(omkar), groupId, input)

    expect(result.ok).toBe(false)
    expect(await db.select().from(expenseEvents)).toEqual([])
  })
})

describe('the "edited" event', () => {
  it('is recorded only when something changed', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)

    await edit(omkar, groupId, expenseId, {})
    await edit(omkar, groupId, expenseId, { description: '  Dinner ' })
    expect(await kindsOf(expenseId)).toEqual(['added'])

    await edit(omkar, groupId, expenseId, { description: 'Lunch' })
    expect(await kindsOf(expenseId)).toEqual(['added', 'edited'])
  })

  it('is not recorded when the edit is refused', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
    const input = await expenseInput(db, omkar.email, groupId, { ...dinner, description: '' })

    const result = await expenseService.updateExpense(db, await id(omkar), groupId, expenseId, input)

    expect(result.ok).toBe(false)
    expect(await kindsOf(expenseId)).toEqual(['added'])
  })
})

describe('the "deleted" event', () => {
  it('is recorded with who deleted it, when, and the expense as it was then', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
    await pause()
    await edit(omkar, groupId, expenseId, { description: 'Lunch' })
    await pause()

    await expenseService.deleteExpense(db, await id(priya), groupId, expenseId)

    const events = await eventsOf(expenseId)
    expect(events.map((event) => event.kind)).toEqual(['added', 'edited', 'deleted'])
    const deleted = events[2]
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    expect(deleted).toMatchObject({ groupId, actedBy: await id(priya), changes: [], deletedAt: null })
    expect(deleted.occurredAt).toEqual(expense.deletedAt)
    expect(deleted.updatedAt).toEqual(deleted.occurredAt)
    expect(deleted.snapshot.description).toBe('Lunch')
  })

  it('is not recorded when nothing was deleted', async () => {
    const groupId = await createGroup(omkar)
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
    await createGroup(sam)

    await expenseService.deleteExpense(db, await id(sam), groupId, expenseId)
    await expenseService.deleteExpense(db, await id(omkar), groupId, crypto.randomUUID())

    expect(await kindsOf(expenseId)).toEqual(['added'])
  })
})

describe('expenseService.restoreExpense', () => {
  it('brings the expense back as it was: not deleted, by this user and now, with a "restored" event', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
    await expenseService.deleteExpense(db, await id(omkar), groupId, expenseId)
    const [deleted] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    await pause()

    const result = await expenseService.restoreExpense(db, await id(priya), groupId, expenseId)

    expect(result).toEqual({ ok: true })
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    expect(expense.deletedAt).toBeNull()
    expect(expense.updatedBy).toBe(await id(priya))
    expect(expense.updatedAt.getTime()).toBeGreaterThan(deleted.updatedAt.getTime())
    expect(expense).toMatchObject({ description: 'Dinner', amountMinor: 1000, createdBy: await id(omkar) })
    const events = await eventsOf(expenseId)
    expect(events.map((event) => event.kind)).toEqual(['added', 'deleted', 'restored'])
    expect(events[2]).toMatchObject({ groupId, actedBy: await id(priya), changes: [], deletedAt: null })
    expect(events[2].occurredAt).toEqual(expense.updatedAt)
    expect(events[2].snapshot).toEqual(events[0].snapshot)
  })

  it('counts it everywhere again: the list, the details, the balance, the edit form and further edits', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const [omkarId, priyaId] = [await id(omkar), await id(priya)]
    const expenseId = await addTestExpense(db, omkar.email, groupId, { ...dinner, amountMinor: 4000 })
    await expenseService.deleteExpense(db, omkarId, groupId, expenseId)
    expect(await expenseService.groupBalances(db, omkarId, groupId)).toEqual([])
    expect(await expenseService.getExpenseToEdit(db, omkarId, groupId, expenseId)).toBeNull()

    await expenseService.restoreExpense(db, omkarId, groupId, expenseId)

    expect((await expenseService.groupBalances(db, omkarId, groupId)).map((balance) => [balance.personId, balance.amountMinor])).toEqual([[priyaId, 2000]])
    const [row] = await expenseService.listExpenses(db, omkarId, groupId)
    expect(row.deleted).toBeUndefined()
    expect((await expenseService.getExpense(db, omkarId, groupId, expenseId))?.deleted).toBeNull()
    expect(await expenseService.getExpenseToEdit(db, omkarId, groupId, expenseId)).not.toBeNull()
    await edit(omkar, groupId, expenseId, { description: 'Lunch' })
    expect((await expenseService.getExpense(db, omkarId, groupId, expenseId))?.description).toBe('Lunch')
  })

  it('keeps the split, the photos and the edit history exactly as they were', async () => {
    const groupId = await createGroup(omkar, [priya.email, sam.email])
    const photo = { id: crypto.randomUUID(), mimeType: 'image/jpeg', sizeBytes: 12 }
    const expenseId = await addTestExpense(db, omkar.email, groupId, { ...dinner, receipts: [photo] })
    await edit(omkar, groupId, expenseId, { description: 'Lunch' })
    const omkarId = await id(omkar)
    const before = await expenseService.getExpenseToEdit(db, omkarId, groupId, expenseId)

    await expenseService.deleteExpense(db, omkarId, groupId, expenseId)
    await expenseService.restoreExpense(db, omkarId, groupId, expenseId)

    expect(await expenseService.getExpenseToEdit(db, omkarId, groupId, expenseId)).toEqual(before)
  })

  it('restores a payment between members too', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const payment = await addTestSettlement(db, omkar.email, priya.email, groupId, { amountMinor: 500, currency: 'INR' })
    const omkarId = await id(omkar)
    await expenseService.deleteExpense(db, omkarId, groupId, payment)
    expect(await expenseService.groupBalances(db, omkarId, groupId)).toEqual([])

    expect(await expenseService.restoreExpense(db, omkarId, groupId, payment)).toEqual({ ok: true })

    expect((await expenseService.groupBalances(db, omkarId, groupId))[0].amountMinor).toBe(500)
    expect(await kindsOf(payment)).toEqual(['added', 'deleted', 'restored'])
  })

  it('counts as activity: the group moves to the top of the list', async () => {
    const first = await createGroup(omkar, [priya.email])
    const second = await createGroup(omkar)
    const expenseId = await addTestExpense(db, omkar.email, first, dinner)
    const omkarId = await id(omkar)
    await expenseService.deleteExpense(db, omkarId, first, expenseId)
    await db.update(expenses).set({ updatedAt: new Date('2020-01-01') })
    expect((await groupService.listGroups(db, omkarId))[0].id).toBe(second)

    await expenseService.restoreExpense(db, omkarId, first, expenseId)

    expect((await groupService.listGroups(db, omkarId))[0].id).toBe(first)
  })

  it('is the same story however often it is deleted and restored: every event stays, in order', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const [omkarId, priyaId] = [await id(omkar), await id(priya)]
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)

    for (const userId of [omkarId, priyaId]) {
      await pause()
      await expenseService.deleteExpense(db, userId, groupId, expenseId)
      await pause()
      await expenseService.restoreExpense(db, omkarId, groupId, expenseId)
    }

    const events = await eventsOf(expenseId)
    expect(events.map((event) => [event.kind, event.actedBy === omkarId ? 'omkar' : 'priya'])).toEqual([
      ['added', 'omkar'],
      ['deleted', 'omkar'],
      ['restored', 'omkar'],
      ['deleted', 'priya'],
      ['restored', 'omkar'],
    ])
    const details = await expenseService.getExpense(db, omkarId, groupId, expenseId)
    expect(details?.history.map((entry) => entry.kind)).toEqual(['restored', 'deleted', 'restored', 'deleted', 'added'])
    expect(details?.deleted).toBeNull()
  })

  it('says an expense that is not deleted is not deleted, and does not record anything', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
    const omkarId = await id(omkar)

    expect(await expenseService.restoreExpense(db, omkarId, groupId, expenseId)).toEqual({ ok: false, notDeleted: true })
    await expenseService.deleteExpense(db, omkarId, groupId, expenseId)
    await expenseService.restoreExpense(db, omkarId, groupId, expenseId)
    // Restored a second time, as if someone else had just done it.
    expect(await expenseService.restoreExpense(db, await id(priya), groupId, expenseId)).toEqual({ ok: false, notDeleted: true })

    expect(await kindsOf(expenseId)).toEqual(['added', 'deleted', 'restored'])
  })

  describe('is not found for', () => {
    it('an unknown or malformed id', async () => {
      const groupId = await createGroup(omkar)
      const omkarId = await id(omkar)

      expect(await expenseService.restoreExpense(db, omkarId, groupId, crypto.randomUUID())).toEqual({ ok: false, notFound: true })
      expect(await expenseService.restoreExpense(db, omkarId, groupId, 'not-an-id')).toEqual({ ok: false, notFound: true })
      expect(await expenseService.restoreExpense(db, omkarId, 'not-an-id', crypto.randomUUID())).toEqual({ ok: false, notFound: true })
    })

    it("another group's expense", async () => {
      const groupId = await createGroup(omkar)
      const other = await createGroup(omkar)
      const expenseId = await addTestExpense(db, omkar.email, other, dinner)
      await expenseService.deleteExpense(db, await id(omkar), other, expenseId)

      expect(await expenseService.restoreExpense(db, await id(omkar), groupId, expenseId)).toEqual({ ok: false, notFound: true })

      const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
      expect(expense.deletedAt).not.toBeNull()
    })

    it('someone who is not in the group, and leaves it deleted', async () => {
      const groupId = await createGroup(omkar, [priya.email])
      const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
      await expenseService.deleteExpense(db, await id(omkar), groupId, expenseId)
      await createGroup(sam)

      expect(await expenseService.restoreExpense(db, await id(sam), groupId, expenseId)).toEqual({ ok: false, notFound: true })

      const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
      expect(expense.deletedAt).not.toBeNull()
      expect(await kindsOf(expenseId)).toEqual(['added', 'deleted'])
    })
  })
})

describe('events are only ever inserted', () => {
  it('each has updated_at equal to occurred_at, updated_by equal to who acted, and no deleted_at', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
    await edit(omkar, groupId, expenseId, { description: 'Lunch' })
    await expenseService.deleteExpense(db, await id(priya), groupId, expenseId)
    await expenseService.restoreExpense(db, await id(omkar), groupId, expenseId)

    const events = await eventsOf(expenseId)

    expect(events).toHaveLength(4)
    for (const event of events) {
      expect(event.updatedAt).toEqual(event.occurredAt)
      expect(event.updatedBy).toBe(event.actedBy)
      expect(event.deletedAt).toBeNull()
      expect(event.groupId).toBe(groupId)
    }
  })
})
