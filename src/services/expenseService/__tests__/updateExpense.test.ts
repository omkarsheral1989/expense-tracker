import { PGlite } from '@electric-sql/pglite'
import { and, asc, eq, isNull } from 'drizzle-orm'
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

function photo(sizeBytes = 10) {
  return { id: crypto.randomUUID(), mimeType: 'image/jpeg', sizeBytes }
}

/** What an edit form would send for the saved expense, with any field replaced. */
async function editInput(
  email: string,
  expenseId: string,
  groupId: string,
  overrides: Partial<CreateExpenseInput> = {},
): Promise<CreateExpenseInput> {
  const toEdit = await expenseService.getExpenseToEdit(db, await personIdOf(db, email), groupId, expenseId)
  if (!toEdit) throw new Error('Not editable.')
  return {
    description: toEdit.description,
    category: toEdit.category,
    amountMinor: toEdit.amountMinor,
    currency: toEdit.currency,
    date: toEdit.date,
    notes: toEdit.notes ?? '',
    paidBy: toEdit.paidBy,
    split: toEdit.split,
    receipts: toEdit.receipts,
    ...overrides,
  }
}

async function edit(
  email: string,
  expenseId: string,
  groupId: string,
  overrides: Partial<CreateExpenseInput> = {},
) {
  return expenseService.updateExpense(
    db,
    await personIdOf(db, email),
    groupId,
    expenseId,
    await editInput(email, expenseId, groupId, overrides),
  )
}

/** Every event of an expense, oldest first (what happened at the same moment in the order it happens). */
async function eventsOf(expenseId: string) {
  const rows = await db.select().from(expenseEvents).where(eq(expenseEvents.expenseId, expenseId))
  const order = ['added', 'edited', 'deleted', 'restored']
  return rows.toSorted((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || order.indexOf(a.kind) - order.indexOf(b.kind))
}

/** The edits of an expense, oldest first. */
async function editsOf(expenseId: string) {
  return (await eventsOf(expenseId)).filter((event) => event.kind === 'edited')
}

async function sharesOf(expenseId: string) {
  const rows = await db.select().from(expenseShares).where(eq(expenseShares.expenseId, expenseId))
  return Object.fromEntries(rows.map((row) => [row.personId, { paid: row.paidMinor, owed: row.owedMinor }]))
}

describe('expenseService.updateExpense', () => {
  it('saves every field and records one edit event with who, when, the expense as it is after and what changed', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const expenseId = await addTestExpense(db, omkar.email, groupId, { ...dinner, notes: 'First' })
    const [omkarId, priyaId] = [await personIdOf(db, omkar.email), await personIdOf(db, priya.email)]

    const before = new Date()
    const result = await edit(priya.email, expenseId, groupId, {
      description: 'Lunch',
      category: 'food.groceries',
      amountMinor: 2400,
      currency: 'GBP',
      date: '2026-10-09',
      notes: 'Second',
      paidBy: priyaId,
    })
    const after = new Date()

    expect(result).toEqual({ ok: true, changed: true })
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    expect(expense).toMatchObject({
      description: 'Lunch',
      category: 'food.groceries',
      amountMinor: 2400,
      currency: 'GBP',
      date: '2026-10-09',
      notes: 'Second',
      updatedBy: priyaId,
      createdBy: omkarId,
    })
    expect(expense.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(await sharesOf(expenseId)).toEqual({
      [omkarId]: { paid: 0, owed: 1200 },
      [priyaId]: { paid: 2400, owed: 1200 },
    })

    const [event] = await editsOf(expenseId)
    expect(event.actedBy).toBe(priyaId)
    expect(event.updatedBy).toBe(priyaId)
    expect(event.deletedAt).toBeNull()
    expect(event.groupId).toBe(groupId)
    expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(event.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime())
    // The event holds the expense as it is after the edit...
    expect(event.snapshot).toEqual({
      description: 'Lunch',
      category: 'food.groceries',
      amountMinor: 2400,
      currency: 'GBP',
      date: '2026-10-09',
      notes: 'Second',
      method: 'equal',
      shares: expect.arrayContaining([
        { personId: omkarId, paidMinor: 0, owedMinor: 1200, inputValue: 1 },
        { personId: priyaId, paidMinor: 2400, owedMinor: 1200, inputValue: 1 },
      ]),
      photos: [],
    })
    // ...and the one before it is the "added" event's.
    const [added] = await eventsOf(expenseId)
    expect(added.kind).toBe('added')
    expect(added.snapshot).toEqual({
      description: 'Dinner',
      category: 'food.dining_out',
      amountMinor: 1000,
      currency: 'INR',
      date: '2026-10-08',
      notes: 'First',
      method: 'equal',
      shares: expect.arrayContaining([
        { personId: omkarId, paidMinor: 1000, owedMinor: 500, inputValue: 1 },
        { personId: priyaId, paidMinor: 0, owedMinor: 500, inputValue: 1 },
      ]),
      photos: [],
    })
    expect(event.changes).toEqual([
      { field: 'description', from: 'Dinner', to: 'Lunch' },
      { field: 'category', from: 'food.dining_out', to: 'food.groceries' },
      { field: 'amount', from: 1000, to: 2400 },
      { field: 'currency', from: 'INR', to: 'GBP' },
      { field: 'date', from: '2026-10-08', to: '2026-10-09' },
      { field: 'notes', from: 'First', to: 'Second' },
      { field: 'paidBy', from: omkarId, to: priyaId },
    ])
  })

  it('records a changed split with the method and what was entered for each person', async () => {
    const groupId = await createGroup(omkar, [priya.email, sam.email])
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
    const [omkarId, priyaId, samId] = await Promise.all(
      [omkar, priya, sam].map((user) => personIdOf(db, user.email)),
    )

    const result = await edit(omkar.email, expenseId, groupId, {
      split: { method: 'percent', values: { [omkarId]: 50, [priyaId]: 30, [samId]: 20 } },
    })

    expect(result).toEqual({ ok: true, changed: true })
    expect(await sharesOf(expenseId)).toEqual({
      [omkarId]: { paid: 1000, owed: 500 },
      [priyaId]: { paid: 0, owed: 300 },
      [samId]: { paid: 0, owed: 200 },
    })
    const [revision] = await editsOf(expenseId)
    expect(revision.snapshot.method).toBe('percent')
    expect(revision.changes).toEqual([
      {
        field: 'split',
        from: { method: 'equal', values: { [omkarId]: 1, [priyaId]: 1, [samId]: 1 } },
        to: { method: 'percent', values: { [omkarId]: 50, [priyaId]: 30, [samId]: 20 } },
      },
    ])
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    expect(expense.method).toBe('percent')
  })

  it('writes nothing when nothing changed, not even when only spaces differ', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const expenseId = await addTestExpense(db, omkar.email, groupId, { ...dinner, notes: 'Cash' })
    const [saved] = await db.select().from(expenses).where(eq(expenses.id, expenseId))

    const same = await edit(omkar.email, expenseId, groupId)
    const spaces = await edit(omkar.email, expenseId, groupId, { description: '  Dinner ', notes: ' Cash  ' })

    expect(same).toEqual({ ok: true, changed: false })
    expect(spaces).toEqual({ ok: true, changed: false })
    expect(await editsOf(expenseId)).toEqual([])
    const [now] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    expect(now.updatedAt).toEqual(saved.updatedAt)
  })

  it('keeps every earlier version: each edit adds an event holding the expense as it is after it', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)

    await edit(omkar.email, expenseId, groupId, { description: 'Lunch' })
    await edit(priya.email, expenseId, groupId, { description: 'Brunch' })

    const events = await eventsOf(expenseId)
    expect(events.map((event) => [event.kind, event.snapshot.description])).toEqual([
      ['added', 'Dinner'],
      ['edited', 'Lunch'],
      ['edited', 'Brunch'],
    ])
    const [, first, second] = events
    expect(first.changes).toEqual([{ field: 'description', from: 'Dinner', to: 'Lunch' }])
    expect(second.changes).toEqual([{ field: 'description', from: 'Lunch', to: 'Brunch' }])
    expect(second.actedBy).toBe(await personIdOf(db, priya.email))
    expect(second.occurredAt.getTime()).toBeGreaterThanOrEqual(first.occurredAt.getTime())
  })

  it('reports every problem at once and writes nothing', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)

    const result = await edit(omkar.email, expenseId, groupId, {
      description: '   ',
      amountMinor: null,
      currency: 'XXXX',
      date: '2026-02-30',
    })

    expect(result).toEqual({
      ok: false,
      errors: {
        description: 'Enter a description.',
        amountMinor: 'Enter an amount.',
        currency: 'Choose a currency.',
        date: 'Choose a date.',
      },
    })
    expect(await editsOf(expenseId)).toEqual([])
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    expect(expense.description).toBe('Dinner')
  })

  it('refuses a split that no longer adds up after the amount changed', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const [omkarId, priyaId] = [await personIdOf(db, omkar.email), await personIdOf(db, priya.email)]
    const expenseId = await addTestExpense(db, omkar.email, groupId, {
      ...dinner,
      split: { method: 'exact', values: { [omkarId]: 400, [priyaId]: 600 } },
    })

    const result = await edit(omkar.email, expenseId, groupId, { amountMinor: 1200 })

    expect(result).toEqual({ ok: false, errors: { split: 'The split no longer adds up.' } })
    expect(await editsOf(expenseId)).toEqual([])
  })

  it('is not found for an unknown or malformed id, a deleted expense, another group\'s expense or a non-member', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const otherGroup = await createGroup(omkar)
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
    const deleted = await addTestExpense(db, omkar.email, groupId, dinner)
    await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, deleted))
    const valid = await expenseInput(db, omkar.email, groupId, dinner)
    const omkarId = await personIdOf(db, omkar.email)
    // A person who is not in the group.
    await createGroup(sam)
    const samId = await personIdOf(db, sam.email)

    const attempts = [
      expenseService.updateExpense(db, omkarId, groupId, crypto.randomUUID(), valid),
      expenseService.updateExpense(db, omkarId, groupId, 'not-an-id', valid),
      expenseService.updateExpense(db, omkarId, groupId, deleted, valid),
      expenseService.updateExpense(db, omkarId, otherGroup, expenseId, valid),
      expenseService.updateExpense(db, samId, groupId, expenseId, valid),
    ]

    for (const result of await Promise.all(attempts)) expect(result).toEqual({ ok: false, notFound: true })
    expect(await editsOf(expenseId)).toEqual([])
  })

  it('does not edit a payment between members', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const payment = await addTestSettlement(db, omkar.email, priya.email, groupId)
    const omkarId = await personIdOf(db, omkar.email)
    const valid = await expenseInput(db, omkar.email, groupId, dinner)

    expect(await expenseService.updateExpense(db, omkarId, groupId, payment, valid)).toEqual({
      ok: false,
      notFound: true,
    })
    expect(await expenseService.getExpenseToEdit(db, omkarId, groupId, payment)).toBeNull()
    expect(await editsOf(payment)).toEqual([])
  })

  it('leaves everyone\'s part alone when only text changed, even after a member joined', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const [omkarId, priyaId] = [await personIdOf(db, omkar.email), await personIdOf(db, priya.email)]
    const expenseId = await addTestExpense(db, omkar.email, groupId, {
      ...dinner,
      split: { method: 'adjustment', values: {} },
    })
    await groupService.addMember(db, omkarId, groupId, await createPerson(sam))

    await edit(omkar.email, expenseId, groupId, { notes: 'Added a note' })

    // Adjustment divides the rest between every member, so a new member would have changed it.
    expect(await sharesOf(expenseId)).toEqual({
      [omkarId]: { paid: 1000, owed: 500 },
      [priyaId]: { paid: 0, owed: 500 },
    })

    // Changing the amount does work the parts out again, with the new member in.
    await edit(omkar.email, expenseId, groupId, { amountMinor: 3000 })
    const samId = await personIdOf(db, sam.email)
    expect(await sharesOf(expenseId)).toEqual({
      [omkarId]: { paid: 3000, owed: 1000 },
      [priyaId]: { paid: 0, owed: 1000 },
      [samId]: { paid: 0, owed: 1000 },
    })
  })

  it('takes photos off with their rows kept, adds new ones and keeps the order', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const [a, b, c] = [photo(), photo(), photo()]
    const expenseId = await addTestExpense(db, omkar.email, groupId, { ...dinner, receipts: [a, b] })
    const d = photo(30)

    const result = await edit(omkar.email, expenseId, groupId, { receipts: [b, d] })

    expect(result).toEqual({ ok: true, changed: true })
    const live = await db
      .select()
      .from(expensePhotos)
      .where(and(eq(expensePhotos.expenseId, expenseId), isNull(expensePhotos.deletedAt)))
      .orderBy(asc(expensePhotos.position))
    expect(live.map((row) => [row.id, row.position, row.sizeBytes])).toEqual([
      [b.id, 0, 10],
      [d.id, 1, 30],
    ])
    const [removed] = await db.select().from(expensePhotos).where(eq(expensePhotos.id, a.id))
    expect(removed.deletedAt).not.toBeNull()
    expect(removed.updatedBy).toBe(await personIdOf(db, omkar.email))

    const [added, revision] = await eventsOf(expenseId)
    expect(added.snapshot.photos.map((row) => row.id)).toEqual([a.id, b.id])
    expect(revision.snapshot.photos.map((row) => [row.id, row.position])).toEqual([[b.id, 0], [d.id, 1]])
    expect(revision.changes).toEqual([{ field: 'receipts', from: [a.id, b.id], to: [b.id, d.id] }])
    expect(c.id).not.toBe(a.id)

    const details = await expenseService.getExpense(db, await personIdOf(db, omkar.email), groupId, expenseId)
    expect(details?.receipts.map((row) => row.id)).toEqual([b.id, d.id])
  })

  it('counts as activity: the expense and its group are changed now', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
    await db.update(expenses).set({ updatedAt: new Date('2020-01-01') }).where(eq(expenses.id, expenseId))

    await edit(omkar.email, expenseId, groupId, { description: 'Lunch' })

    const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    expect(expense.updatedAt.getFullYear()).toBeGreaterThan(2020)
    const [group] = await groupService.listGroups(db, await personIdOf(db, omkar.email))
    expect(group.lastActivityAt.getFullYear()).toBeGreaterThan(2020)
  })
})

describe('expenseService.getExpenseToEdit', () => {
  it('gives the expense in the form\'s terms: fields, payer, what was entered for the split and photos', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const [omkarId, priyaId] = [await personIdOf(db, omkar.email), await personIdOf(db, priya.email)]
    const a = photo()
    const expenseId = await addTestExpense(db, priya.email, groupId, {
      ...dinner,
      notes: 'Cash',
      paidBy: priyaId,
      split: { method: 'shares', values: { [omkarId]: 1, [priyaId]: 3 } },
      receipts: [a],
    })

    const toEdit = await expenseService.getExpenseToEdit(db, omkarId, groupId, expenseId)

    expect(toEdit).toEqual({
      id: expenseId,
      description: 'Dinner',
      category: 'food.dining_out',
      amountMinor: 1000,
      currency: 'INR',
      date: '2026-10-08',
      notes: 'Cash',
      paidBy: priyaId,
      split: { method: 'shares', values: { [omkarId]: 1, [priyaId]: 3 } },
      receipts: [a],
    })
  })
})

describe('expenseService.getExpense: last edit', () => {
  it('has none until the expense is edited, then names the latest editor and time', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const [omkarId, priyaId] = [await personIdOf(db, omkar.email), await personIdOf(db, priya.email)]
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
    expect((await expenseService.getExpense(db, omkarId, groupId, expenseId))?.lastEdit).toBeNull()

    await edit(omkar.email, expenseId, groupId, { description: 'Lunch' })
    await edit(priya.email, expenseId, groupId, { description: 'Brunch' })

    const asOmkar = await expenseService.getExpense(db, omkarId, groupId, expenseId)
    const asPriya = await expenseService.getExpense(db, priyaId, groupId, expenseId)
    expect(asOmkar?.lastEdit?.by).toEqual({ email: priya.email, name: null, isYou: false })
    expect(asPriya?.lastEdit?.by).toEqual({ email: priya.email, name: null, isYou: true })
    const [, second] = await editsOf(expenseId)
    expect(asOmkar?.lastEdit?.at).toEqual(second.occurredAt)
  })
})

describe('expenseService.getExpense: created time and history', () => {
  it('has the time it was added, which an edit does not change', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const before = new Date()
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)
    const after = new Date()
    const omkarId = await personIdOf(db, omkar.email)

    const added = (await expenseService.getExpense(db, omkarId, groupId, expenseId))?.createdAt
    expect(added?.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(added?.getTime()).toBeLessThanOrEqual(after.getTime())

    await edit(omkar.email, expenseId, groupId, { description: 'Lunch' })

    expect((await expenseService.getExpense(db, omkarId, groupId, expenseId))?.createdAt).toEqual(added)
  })

  it('has just its "added" event until something else happens to it', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)

    const details = await expenseService.getExpense(db, await personIdOf(db, omkar.email), groupId, expenseId)

    expect(details?.history).toEqual([
      {
        kind: 'added',
        by: { email: omkar.email, name: 'Omkar', isYou: true },
        at: details?.createdAt,
        changes: [],
        currencyBefore: 'INR',
      },
    ])
    expect(details?.people).toEqual({})
    expect(details?.lastEdit).toBeNull()
  })

  it('lists every edit newest first, with who, when, what changed and the currency before', async () => {
    const groupId = await createGroup(omkar, [priya.email, sam.email])
    const [omkarId, priyaId, samId] = await Promise.all([omkar, priya, sam].map((user) => personIdOf(db, user.email)))
    const expenseId = await addTestExpense(db, omkar.email, groupId, dinner)

    await edit(omkar.email, expenseId, groupId, { currency: 'GBP', amountMinor: 2000 })
    await edit(priya.email, expenseId, groupId, {
      paidBy: priyaId,
      split: { method: 'percent', values: { [omkarId]: 50, [priyaId]: 30, [samId]: 20 } },
    })

    const asOmkar = await expenseService.getExpense(db, omkarId, groupId, expenseId)
    expect(asOmkar?.history.map((entry) => entry.kind)).toEqual(['edited', 'edited', 'added'])
    const [latest, first] = asOmkar?.history ?? []
    expect(latest.by).toEqual({ email: priya.email, name: null, isYou: false })
    expect(latest.currencyBefore).toBe('GBP')
    expect(latest.changes.map((change) => change.field)).toEqual(['paidBy', 'split'])
    expect(latest.at.getTime()).toBeGreaterThanOrEqual(first.at.getTime())
    expect(first.by).toEqual({ email: omkar.email, name: 'Omkar', isYou: true })
    expect(first.currencyBefore).toBe('INR')
    expect(first.changes).toEqual([
      { field: 'amount', from: 1000, to: 2000 },
      { field: 'currency', from: 'INR', to: 'GBP' },
    ])

    // Everyone the changes mention, named for whoever reads them.
    expect(asOmkar?.people).toEqual({
      [omkarId]: { email: omkar.email, name: 'Omkar', isYou: true },
      [priyaId]: { email: priya.email, name: null, isYou: false },
      [samId]: { email: sam.email, name: null, isYou: false },
    })
    const asPriya = await expenseService.getExpense(db, priyaId, groupId, expenseId)
    expect(asPriya?.people[priyaId].isYou).toBe(true)
    expect(asPriya?.history[1].by.isYou).toBe(false)
    expect(asPriya?.history[0].by.isYou).toBe(true)
    expect(asPriya?.history[2].by.isYou).toBe(false)
  })
})

/** Saves a person who is not in any group yet and returns their id. */
async function createPerson(user: TestUser): Promise<string> {
  await createGroup(user)
  return personIdOf(db, user.email)
}
