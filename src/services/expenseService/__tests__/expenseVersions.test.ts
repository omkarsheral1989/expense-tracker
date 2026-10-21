import { PGlite } from '@electric-sql/pglite'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { expenseEvents, expensePhotos, expenseShares, expenses } from '../../../db/schema.ts'
import { addTestExpense, addTestSettlement, personIdOf } from '../../../testing/expenses.ts'
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
const photo = (sizeBytes = 10) => ({ id: crypto.randomUUID(), mimeType: 'image/jpeg', sizeBytes })

/** Every event of an expense, oldest first. */
async function eventsOf(expenseId: string) {
  const order = ['added', 'edited', 'deleted', 'restored', 'reverted']
  const rows = await db.select().from(expenseEvents).where(eq(expenseEvents.expenseId, expenseId))
  return rows.toSorted((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || order.indexOf(a.kind) - order.indexOf(b.kind))
}

async function pause() {
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
  await pause()
}

async function sharesOf(expenseId: string) {
  const rows = await db.select().from(expenseShares).where(and(eq(expenseShares.expenseId, expenseId), isNull(expenseShares.deletedAt)))
  return Object.fromEntries(rows.map((row) => [row.personId, [row.paidMinor, row.owedMinor, row.inputValue]]))
}

async function livePhotoIds(expenseId: string) {
  const rows = await db
    .select()
    .from(expensePhotos)
    .where(and(eq(expensePhotos.expenseId, expenseId), isNull(expensePhotos.deletedAt)))
    .orderBy(asc(expensePhotos.position))
  return rows.map((row) => row.id)
}

/** An expense edited twice: Dinner 10.00 with a photo, then Lunch 20.00 paid by Priya with another photo. */
async function editedExpense() {
  const groupId = await createGroup(omkar, [priya.email, sam.email])
  const [omkarId, priyaId, samId] = await Promise.all([omkar, priya, sam].map(id))
  const a = photo()
  const expenseId = await addTestExpense(db, omkar.email, groupId, { ...dinner, receipts: [a] })
  await pause()
  const b = photo(30)
  await edit(omkar, groupId, expenseId, {
    description: 'Lunch',
    amountMinor: 2000,
    paidBy: priyaId,
    split: { method: 'percent', values: { [omkarId]: 50, [priyaId]: 30, [samId]: 20 } },
    receipts: [a, b],
  })
  await edit(omkar, groupId, expenseId, { description: 'Brunch', notes: '', receipts: [b] })
  const [added, first, second] = await eventsOf(expenseId)
  return { groupId, expenseId, a, b, omkarId, priyaId, samId, added, first, second }
}

describe('expenseService.getExpenseVersion', () => {
  it('gives the expense as it was right after an event: fields, split with names, photos and the event', async () => {
    const { groupId, expenseId, omkarId, priyaId, added, first, a, b } = await editedExpense()

    const original = await expenseService.getExpenseVersion(db, omkarId, groupId, expenseId, added.id)
    expect(original?.version).toMatchObject({ description: 'Dinner', amountMinor: 1000, currency: 'INR', date: '2026-10-08', notes: 'Card', method: 'equal' })
    expect(original?.version.receipts).toEqual([{ id: a.id, mimeType: 'image/jpeg' }])
    expect(original?.version.shares).toEqual([
      { personId: omkarId, email: omkar.email, name: 'Omkar', isYou: true, paidMinor: 1000, owedMinor: 333 + 1 },
      { personId: priyaId, email: priya.email, name: null, isYou: false, paidMinor: 0, owedMinor: 333 },
      expect.objectContaining({ email: sam.email, owedMinor: 333 }),
    ])
    expect(original?.event).toMatchObject({ id: added.id, kind: 'added', by: { email: omkar.email, isYou: true }, changes: [] })

    const edited = await expenseService.getExpenseVersion(db, priyaId, groupId, expenseId, first.id)
    expect(edited?.version).toMatchObject({ description: 'Lunch', amountMinor: 2000, method: 'percent', notes: 'Card' })
    expect(edited?.version.receipts.map((photoRow) => photoRow.id)).toEqual([a.id, b.id])
    // Priya paid 20.00 and owes 30%: seen by her, she is the viewer and comes first.
    expect(edited?.version.shares[0]).toMatchObject({ personId: priyaId, isYou: true, paidMinor: 2000, owedMinor: 600 })
    expect(edited?.event).toMatchObject({ kind: 'edited', by: { email: omkar.email, isYou: false }, currencyBefore: 'INR' })
    expect(edited?.event.changes.map((change) => change.field)).toEqual(['description', 'amount', 'paidBy', 'split', 'receipts'])
    // The people the changes mention are named.
    expect(Object.keys(edited?.people ?? {}).toSorted()).toEqual([omkarId, priyaId, await id(sam)].toSorted())
  })

  it('says which version is the current one, and which are not', async () => {
    const { groupId, expenseId, omkarId, added, first, second } = await editedExpense()
    const isCurrent = async (eventId: string) => (await expenseService.getExpenseVersion(db, omkarId, groupId, expenseId, eventId))?.isCurrent

    expect(await isCurrent(added.id)).toBe(false)
    expect(await isCurrent(first.id)).toBe(false)
    expect(await isCurrent(second.id)).toBe(true)
  })

  it('stops being current once the expense changes again, and an unchanged expense has only the current version', async () => {
    const { groupId, expenseId, omkarId, second } = await editedExpense()
    await edit(omkar, groupId, expenseId, { description: 'Tea' })

    expect((await expenseService.getExpenseVersion(db, omkarId, groupId, expenseId, second.id))?.isCurrent).toBe(false)
    const [, , , third] = await eventsOf(expenseId)
    expect((await expenseService.getExpenseVersion(db, omkarId, groupId, expenseId, third.id))?.isCurrent).toBe(true)
  })

  it('opens a version of a deleted expense, saying it is deleted, and of a payment, saying it is a payment', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const omkarId = await id(omkar)
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
    await expenseService.deleteExpense(db, omkarId, groupId, expenseId)
    const payment = await addTestSettlement(db, omkar.email, priya.email, groupId, { amountMinor: 500, currency: 'INR' })

    const [added] = await eventsOf(expenseId)
    const [paymentAdded] = await eventsOf(payment)
    const deleted = await expenseService.getExpenseVersion(db, omkarId, groupId, expenseId, added.id)
    const settlement = await expenseService.getExpenseVersion(db, omkarId, groupId, payment, paymentAdded.id)

    expect(deleted).toMatchObject({ expenseDeleted: true, isPayment: false })
    expect(settlement).toMatchObject({ expenseDeleted: false, isPayment: true })
  })

  it('counts a reversion as the last edit', async () => {
    const { groupId, expenseId, priyaId, added } = await editedExpense()
    await expenseService.restoreVersion(db, priyaId, groupId, expenseId, added.id)

    const details = await expenseService.getExpense(db, priyaId, groupId, expenseId)

    const [reverted] = (await eventsOf(expenseId)).toReversed()
    expect(details?.lastEdit).toEqual({ by: { email: priya.email, name: null, isYou: true }, at: reverted.occurredAt })
  })

  it('says when a reversion went back to, and gives its time', async () => {
    const { groupId, expenseId, omkarId, first } = await editedExpense()
    await expenseService.restoreVersion(db, omkarId, groupId, expenseId, first.id)

    const [, , , reverted] = await eventsOf(expenseId)
    const version = await expenseService.getExpenseVersion(db, omkarId, groupId, expenseId, reverted.id)
    expect(version?.event).toMatchObject({ kind: 'reverted', restoredFromAt: first.occurredAt })
    const details = await expenseService.getExpense(db, omkarId, groupId, expenseId)
    expect(details?.history[0]).toMatchObject({ kind: 'reverted', id: reverted.id, restoredFromAt: first.occurredAt })
    expect(details?.history.map((entry) => entry.id)).toEqual((await eventsOf(expenseId)).map((event) => event.id).toReversed())
  })

  describe('is null for', () => {
    it('unknown or malformed ids', async () => {
      const { groupId, expenseId, omkarId, added } = await editedExpense()

      expect(await expenseService.getExpenseVersion(db, omkarId, groupId, expenseId, crypto.randomUUID())).toBeNull()
      expect(await expenseService.getExpenseVersion(db, omkarId, groupId, expenseId, 'not-an-id')).toBeNull()
      expect(await expenseService.getExpenseVersion(db, omkarId, groupId, crypto.randomUUID(), added.id)).toBeNull()
      expect(await expenseService.getExpenseVersion(db, omkarId, 'not-an-id', expenseId, added.id)).toBeNull()
    })

    it("another expense's event, and another group's expense", async () => {
      const { groupId, expenseId, omkarId } = await editedExpense()
      const other = await addTestExpense(db, omkar.email, groupId, { ...dinner, description: 'Other' })
      const [otherAdded] = await eventsOf(other)
      const elsewhere = await createGroup(omkar)

      expect(await expenseService.getExpenseVersion(db, omkarId, groupId, expenseId, otherAdded.id)).toBeNull()
      expect(await expenseService.getExpenseVersion(db, omkarId, elsewhere, expenseId, otherAdded.id)).toBeNull()
    })

    it('someone who is not in the group', async () => {
      const { groupId, expenseId, added } = await editedExpense()
      const outsider: TestUser = { email: 'outsider@gmail.com', name: 'Out' }
      await createGroup(outsider)

      expect(await expenseService.getExpenseVersion(db, await id(outsider), groupId, expenseId, added.id)).toBeNull()
    })
  })
})

describe('expenseService.restoreVersion', () => {
  it('puts every field back, writes the shares as they were, and records a "reverted" event', async () => {
    const { groupId, expenseId, omkarId, priyaId, samId, added, second } = await editedExpense()
    const [expenseBefore] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    await pause()

    const result = await expenseService.restoreVersion(db, priyaId, groupId, expenseId, added.id)

    expect(result).toEqual({ ok: true })
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    expect(expense).toMatchObject({ description: 'Dinner', amountMinor: 1000, currency: 'INR', date: '2026-10-08', notes: 'Card', method: 'equal', updatedBy: priyaId, deletedAt: null })
    expect(expense.updatedAt.getTime()).toBeGreaterThan(expenseBefore.updatedAt.getTime())
    expect(expense.createdBy).toBe(omkarId)
    expect(await sharesOf(expenseId)).toEqual({
      [omkarId]: [1000, 334, 1],
      [priyaId]: [0, 333, 1],
      [samId]: [0, 333, 1],
    })
    const events = await eventsOf(expenseId)
    const reverted = events.at(-1)
    expect(reverted).toMatchObject({ kind: 'reverted', actedBy: priyaId, groupId, restoredFrom: added.id, deletedAt: null })
    expect(reverted?.updatedAt).toEqual(reverted?.occurredAt)
    expect(reverted?.occurredAt).toEqual(expense.updatedAt)
    expect(reverted?.snapshot).toEqual(added.snapshot)
    // What changed back, from the current version (second) to the original.
    expect(reverted?.changes.map((change) => change.field)).toEqual(['description', 'amount', 'notes', 'paidBy', 'split', 'receipts'])
    expect(reverted?.changes[0]).toEqual({ field: 'description', from: 'Brunch', to: 'Dinner' })
    expect(second.snapshot.description).toBe('Brunch')
  })

  it('takes the photos back as they were: those taken off return, those added since go', async () => {
    const { groupId, expenseId, omkarId, a, b, added } = await editedExpense()
    expect(await livePhotoIds(expenseId)).toEqual([b.id])

    await expenseService.restoreVersion(db, omkarId, groupId, expenseId, added.id)

    expect(await livePhotoIds(expenseId)).toEqual([a.id])
    const [gone] = await db.select().from(expensePhotos).where(eq(expensePhotos.id, b.id))
    expect(gone.deletedAt).not.toBeNull()
    expect((await expenseService.getExpense(db, omkarId, groupId, expenseId))?.receipts.map((row) => row.id)).toEqual([a.id])
  })

  it('goes back and forth: the version it replaced can be put back the same way', async () => {
    const { groupId, expenseId, omkarId, added, second } = await editedExpense()

    await expenseService.restoreVersion(db, omkarId, groupId, expenseId, added.id)
    await pause()
    await expenseService.restoreVersion(db, omkarId, groupId, expenseId, second.id)

    const details = await expenseService.getExpense(db, omkarId, groupId, expenseId)
    expect(details).toMatchObject({ description: 'Brunch', notes: null })
    expect(details?.receipts).toHaveLength(1)
    expect(details?.history.map((entry) => entry.kind)).toEqual(['reverted', 'reverted', 'edited', 'edited', 'added'])
  })

  it('counts everywhere: the balance follows the amount and the split of the version', async () => {
    const { groupId, expenseId, omkarId, priyaId, added, first } = await editedExpense()
    const owed = async () => (await expenseService.groupBalances(db, omkarId, groupId)).map((balance) => [balance.personId, balance.amountMinor])

    // As it is now (Priya paid 20.00, Omkar owes 50% of it): Omkar owes Priya.
    expect((await owed()).find(([person]) => person === priyaId)?.[1]).toBe(-1000)

    await expenseService.restoreVersion(db, omkarId, groupId, expenseId, added.id)
    expect((await owed()).find(([person]) => person === priyaId)?.[1]).toBe(333)

    await expenseService.restoreVersion(db, omkarId, groupId, expenseId, first.id)
    expect((await owed()).find(([person]) => person === priyaId)?.[1]).toBe(-1000)
  })

  it('counts as activity: the group moves to the top of the list', async () => {
    const { groupId, expenseId, omkarId, added } = await editedExpense()
    const second = await createGroup(omkar)
    await db.update(expenses).set({ updatedAt: new Date('2020-01-01') })
    expect((await groupService.listGroups(db, omkarId))[0].id).toBe(second)

    await expenseService.restoreVersion(db, omkarId, groupId, expenseId, added.id)

    expect((await groupService.listGroups(db, omkarId))[0].id).toBe(groupId)
  })

  it('gives a member who joined since no part, as in that version, and keeps every share row', async () => {
    const { groupId, expenseId, omkarId, added } = await editedExpense()
    const newcomer: TestUser = { email: 'newcomer@gmail.com', name: 'New' }
    await createGroup(newcomer)
    await groupService.addMember(db, omkarId, groupId, await id(newcomer))
    await edit(omkar, groupId, expenseId, { amountMinor: 3000 })

    await expenseService.restoreVersion(db, omkarId, groupId, expenseId, added.id)

    // The newcomer got a row when the amount was edited; the old version gave them no part.
    const shares = await sharesOf(expenseId)
    expect(Object.keys(shares)).toHaveLength(4)
    expect(shares[await id(newcomer)]).toEqual([0, 0, null])
    expect(shares[await id(omkar)]).toEqual([1000, 334, 1])
  })

  it('says it is already the current version, and records nothing', async () => {
    const { groupId, expenseId, omkarId, second } = await editedExpense()
    const before = await eventsOf(expenseId)

    expect(await expenseService.restoreVersion(db, omkarId, groupId, expenseId, second.id)).toEqual({ ok: false, alreadyCurrent: true })

    expect(await eventsOf(expenseId)).toHaveLength(before.length)
  })

  it('says a deleted expense has to be restored first, and changes nothing', async () => {
    const { groupId, expenseId, omkarId, added } = await editedExpense()
    await expenseService.deleteExpense(db, omkarId, groupId, expenseId)
    const before = await eventsOf(expenseId)

    expect(await expenseService.restoreVersion(db, omkarId, groupId, expenseId, added.id)).toEqual({ ok: false, expenseDeleted: true })

    expect(await eventsOf(expenseId)).toHaveLength(before.length)
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    expect(expense.description).toBe('Brunch')
  })

  it('is not found for a payment between members', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const payment = await addTestSettlement(db, omkar.email, priya.email, groupId, { amountMinor: 500, currency: 'INR' })
    const [added] = await eventsOf(payment)

    expect(await expenseService.restoreVersion(db, await id(omkar), groupId, payment, added.id)).toEqual({ ok: false, notFound: true })
  })

  describe('is not found for', () => {
    it('unknown or malformed ids', async () => {
      const { groupId, expenseId, omkarId, added } = await editedExpense()

      for (const result of await Promise.all([
        expenseService.restoreVersion(db, omkarId, groupId, expenseId, crypto.randomUUID()),
        expenseService.restoreVersion(db, omkarId, groupId, expenseId, 'not-an-id'),
        expenseService.restoreVersion(db, omkarId, groupId, crypto.randomUUID(), added.id),
        expenseService.restoreVersion(db, omkarId, 'not-an-id', expenseId, added.id),
      ])) {
        expect(result).toEqual({ ok: false, notFound: true })
      }
    })

    it("another expense's event, and someone outside the group, and changes nothing", async () => {
      const { groupId, expenseId, omkarId, added } = await editedExpense()
      const other = await addTestExpense(db, omkar.email, groupId, { ...dinner, description: 'Other' })
      const [otherAdded] = await eventsOf(other)
      const outsider: TestUser = { email: 'outsider@gmail.com', name: 'Out' }
      await createGroup(outsider)
      const before = await eventsOf(expenseId)

      expect(await expenseService.restoreVersion(db, omkarId, groupId, expenseId, otherAdded.id)).toEqual({ ok: false, notFound: true })
      expect(await expenseService.restoreVersion(db, await id(outsider), groupId, expenseId, added.id)).toEqual({ ok: false, notFound: true })

      expect(await eventsOf(expenseId)).toHaveLength(before.length)
      const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
      expect(expense.description).toBe('Brunch')
    })
  })
})
