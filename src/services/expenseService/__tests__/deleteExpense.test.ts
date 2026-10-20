import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { expenseEvents, expensePhotos, expenseShares, expenses } from '../../../db/schema.ts'
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
  notes: '',
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

async function remove(user: TestUser, groupId: string, expenseId: string) {
  return expenseService.deleteExpense(db, await id(user), groupId, expenseId)
}

describe('expenseService.deleteExpense', () => {
  it('marks the expense deleted, by this user and now, and says so', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
    await db.update(expenses).set({ updatedAt: new Date('2020-01-01') }).where(eq(expenses.id, expenseId))
    const before = new Date()

    const result = await remove(priya, groupId, expenseId)

    expect(result).toEqual({ ok: true })
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    expect(expense.deletedAt).not.toBeNull()
    expect(expense.deletedAt?.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(expense.updatedAt).toEqual(expense.deletedAt)
    expect(expense.updatedBy).toBe(await id(priya))
    expect(expense.createdBy).toBe(await id(omkar))
    expect(expense.description).toBe('Dinner')
  })

  it('erases nothing: the split, the photos and the edit history stay', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const photo = { id: crypto.randomUUID(), mimeType: 'image/jpeg', sizeBytes: 10 }
    const expenseId = await addTestExpense(db, omkar.email, groupId, { ...dinner, receipts: [photo] })
    const toEdit = await expenseService.getExpenseToEdit(db, await id(omkar), groupId, expenseId)
    await expenseService.updateExpense(db, await id(omkar), groupId, expenseId, {
      ...(await expenseInput(db, omkar.email, groupId, { ...dinner, receipts: toEdit?.receipts })),
      description: 'Lunch',
    })

    await remove(omkar, groupId, expenseId)

    expect(await db.select().from(expenseShares).where(eq(expenseShares.expenseId, expenseId))).toHaveLength(2)
    const [row] = await db.select().from(expensePhotos).where(eq(expensePhotos.id, photo.id))
    expect(row.deletedAt).toBeNull()
    // The events stay too: added, edited, and now deleted.
    const events = await db.select().from(expenseEvents).where(eq(expenseEvents.expenseId, expenseId))
    expect(events.map((event) => event.kind).toSorted()).toEqual(['added', 'deleted', 'edited'])
  })

  it('keeps it in the list and details, marked as deleted, and out of the edit form and further edits', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const kept = await addTestExpense(db, omkar.email, groupId, { ...dinner, description: 'Kept' })
    const gone = await addTestExpense(db, omkar.email, groupId, dinner)
    const omkarId = await id(omkar)

    await remove(priya, groupId, gone)

    const list = await expenseService.listExpenses(db, omkarId, groupId)
    expect(list.map((item) => [item.description, item.deleted?.by.email ?? null]).toSorted()).toEqual([
      ['Dinner', priya.email],
      ['Kept', null],
    ])
    const details = await expenseService.getExpense(db, omkarId, groupId, gone)
    expect(details?.description).toBe('Dinner')
    expect(details?.deleted?.by).toEqual({ email: priya.email, name: null, isYou: false })
    expect(details?.deleted?.at).toBeInstanceOf(Date)
    expect((await expenseService.getExpense(db, await id(priya), groupId, gone))?.deleted?.by.isYou).toBe(true)
    expect((await expenseService.getExpense(db, omkarId, groupId, kept))?.deleted).toBeNull()
    expect(await expenseService.getExpenseToEdit(db, omkarId, groupId, gone)).toBeNull()
    const input = await expenseInput(db, omkar.email, groupId, dinner)
    expect(await expenseService.updateExpense(db, omkarId, groupId, gone, input)).toEqual({ ok: false, notFound: true })
  })

  it('still shows the edit history of a deleted expense', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
    const omkarId = await id(omkar)
    const toEdit = await expenseService.getExpenseToEdit(db, omkarId, groupId, expenseId)
    await expenseService.updateExpense(db, omkarId, groupId, expenseId, {
      ...(await expenseInput(db, omkar.email, groupId, dinner)),
      split: toEdit?.split ?? { method: 'equal', values: {} },
      description: 'Lunch',
    })

    await remove(omkar, groupId, expenseId)

    const details = await expenseService.getExpense(db, omkarId, groupId, expenseId)
    expect(details?.history.map((entry) => entry.kind)).toEqual(['deleted', 'edited', 'added'])
    expect(details?.history[1].changes[0]).toEqual({ field: 'description', from: 'Dinner', to: 'Lunch' })
    expect(details?.description).toBe('Lunch')
  })

  it('takes the expense out of the balances', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const [omkarId, priyaId] = [await id(omkar), await id(priya)]
    await addTestExpense(db, omkar.email, groupId, { ...dinner, amountMinor: 1000 })
    const second = await addTestExpense(db, omkar.email, groupId, { ...dinner, amountMinor: 4000 })
    const owed = async () => (await expenseService.groupBalances(db, omkarId, groupId)).map((balance) => [balance.personId, balance.amountMinor])
    expect(await owed()).toEqual([[priyaId, 2500]])

    await remove(priya, groupId, second)

    expect(await owed()).toEqual([[priyaId, 500]])
    expect((await expenseService.balancesByGroup(db, omkarId))[groupId]).toEqual([{ currency: 'INR', amountMinor: 500 }])
  })

  it('settles the balance again when the only expense is deleted', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)

    await remove(omkar, groupId, expenseId)

    expect(await expenseService.groupBalances(db, await id(omkar), groupId)).toEqual([])
  })

  it('lets any member delete a payment between members, and the balance goes back', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    await addTestExpense(db, omkar.email, groupId, dinner)
    const payment = await addTestSettlement(db, priya.email, omkar.email, groupId, { amountMinor: 500, currency: 'INR' })
    const omkarId = await id(omkar)

    // Priya paid back the 5.00 she owed: all settled up.
    expect(await expenseService.groupBalances(db, omkarId, groupId)).toEqual([])
    expect(await remove(omkar, groupId, payment)).toEqual({ ok: true })

    const [owed] = await expenseService.groupBalances(db, omkarId, groupId)
    expect(owed.amountMinor).toBe(500)
    expect((await expenseService.listExpenses(db, omkarId, groupId)).map((item) => item.description).toSorted()).toEqual(['Dinner', 'Payment'])
  })

  it('counts as activity: the group moves to the top of the list', async () => {
    const first = await createGroup(omkar, [priya.email])
    const second = await createGroup(omkar)
    const expenseId = await addTestExpense(db, omkar.email, first, dinner)
    await db.update(expenses).set({ updatedAt: new Date('2020-01-01') }).where(eq(expenses.id, expenseId))
    await db.update(expenses).set({ updatedAt: new Date('2020-01-01') })
    const omkarId = await id(omkar)
    expect((await groupService.listGroups(db, omkarId))[0].id).toBe(second)

    await remove(omkar, first, expenseId)

    expect((await groupService.listGroups(db, omkarId))[0].id).toBe(first)
  })

  describe('is not found for', () => {
    async function expectNothingChanged(expenseId: string) {
      const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
      expect(expense.deletedAt).toBeNull()
    }

    it('an unknown or malformed id', async () => {
      const groupId = await createGroup(omkar)
      const omkarId = await id(omkar)

      expect(await expenseService.deleteExpense(db, omkarId, groupId, crypto.randomUUID())).toEqual({ ok: false, notFound: true })
      expect(await expenseService.deleteExpense(db, omkarId, groupId, 'not-an-id')).toEqual({ ok: false, notFound: true })
      expect(await expenseService.deleteExpense(db, omkarId, 'not-an-id', crypto.randomUUID())).toEqual({ ok: false, notFound: true })
    })

    it('an expense that was already deleted, and does not delete it again', async () => {
      const groupId = await createGroup(omkar)
      const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
      await remove(omkar, groupId, expenseId)
      const [first] = await db.select().from(expenses).where(eq(expenses.id, expenseId))

      expect(await remove(omkar, groupId, expenseId)).toEqual({ ok: false, notFound: true })

      const [second] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
      expect(second.deletedAt).toEqual(first.deletedAt)
    })

    it("another group's expense", async () => {
      const groupId = await createGroup(omkar)
      const other = await createGroup(omkar)
      const expenseId = await addTestExpense(db, omkar.email, other, dinner)

      expect(await remove(omkar, groupId, expenseId)).toEqual({ ok: false, notFound: true })
      await expectNothingChanged(expenseId)
    })

    it('someone who is not in the group', async () => {
      const groupId = await createGroup(omkar, [priya.email])
      const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
      await createGroup(sam)

      expect(await remove(sam, groupId, expenseId)).toEqual({ ok: false, notFound: true })
      await expectNothingChanged(expenseId)
    })
  })
})
