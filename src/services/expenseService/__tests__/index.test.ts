import { PGlite } from '@electric-sql/pglite'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { expensePhotos, expenseShares, expenses, groupMembers, groups, people } from '../../../db/schema.ts'
import { expenseService } from '../index.ts'
import type { CreateExpenseInput, CreateSettlementInput } from '../types.ts'
import { addTestExpense, addTestSettlement, expenseInput } from '../../../testing/expenses.ts'
import { createTestGroup, type TestUser } from '../../../testing/groups.ts'
import { personIdForEmail } from '../../../testing/ids.ts'

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

/** A valid expense by `email` in a group: the dinner, with any field replaced. */
function input(email: string, groupId: string, overrides: Partial<CreateExpenseInput> = {}) {
  return expenseInput(db, email, groupId, { ...dinner, ...overrides })
}

async function addExpense(
  email: string,
  groupId: string,
  overrides: Partial<CreateExpenseInput> = {},
) {
  return addTestExpense(db, email, groupId, { ...dinner, ...overrides })
}

/** Sets when an expense was last changed, so ordering does not depend on the clock. */
async function changedAt(expenseId: string, iso: string) {
  await db.update(expenses).set({ updatedAt: new Date(iso) }).where(eq(expenses.id, expenseId))
}

/** Sets when an expense was added, which orders the expenses of one day. */
async function addedAt(expenseId: string, iso: string) {
  await db.update(expenses).set({ createdAt: new Date(iso) }).where(eq(expenses.id, expenseId))
}

async function personId(email: string) {
  const [person] = await db.select({ id: people.id }).from(people).where(eq(people.email, email))
  return person.id
}

describe('createExpense', () => {
  it('saves the expense, paid by the user and split equally between every member', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com', 'sam@gmail.com'])
    const id = await addExpense('omkar@gmail.com', groupId, {
      description: '  Dinner at the beach  ',
      notes: '  Paid by card ',
    })
    const me = await personId('omkar@gmail.com')

    const [expense] = await db.select().from(expenses).where(eq(expenses.id, id))
    expect(expense).toMatchObject({
      groupId,
      description: 'Dinner at the beach',
      category: 'food.dining_out',
      amountMinor: 1000,
      currency: 'INR',
      date: '2026-10-08',
      notes: 'Paid by card',
      method: 'equal',
      createdBy: me,
      updatedBy: me,
      deletedAt: null,
    })

    const shares = await db
      .select({
        email: people.email,
        paid: expenseShares.paidMinor,
        owed: expenseShares.owedMinor,
        input: expenseShares.inputValue,
        updatedBy: expenseShares.updatedBy,
      })
      .from(expenseShares)
      .innerJoin(people, eq(people.id, expenseShares.personId))
      .where(eq(expenseShares.expenseId, id))
      .orderBy(people.email)
    expect(shares).toEqual([
      // 10.00 does not divide by 3: the payer takes the extra paisa.
      { email: 'omkar@gmail.com', paid: 1000, owed: 334, input: 1, updatedBy: me },
      { email: 'priya@gmail.com', paid: 0, owed: 333, input: 1, updatedBy: me },
      { email: 'sam@gmail.com', paid: 0, owed: 333, input: 1, updatedBy: me },
    ])
  })

  it('saves who paid and the split as entered, for any method', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com', 'sam@gmail.com'])
    const [me, priyaId, samId] = await Promise.all(
      ['omkar@gmail.com', 'priya@gmail.com', 'sam@gmail.com'].map(personId),
    )
    const id = await addExpense('omkar@gmail.com', groupId, {
      amountMinor: 1000,
      paidBy: priyaId,
      split: { method: 'percent', values: { [me]: 50, [samId]: 50 } },
    })

    const [expense] = await db.select().from(expenses).where(eq(expenses.id, id))
    expect(expense.method).toBe('percent')
    const shares = await db
      .select({ email: people.email, paid: expenseShares.paidMinor, owed: expenseShares.owedMinor, input: expenseShares.inputValue })
      .from(expenseShares)
      .innerJoin(people, eq(people.id, expenseShares.personId))
      .where(eq(expenseShares.expenseId, id))
      .orderBy(people.email)
    expect(shares).toEqual([
      { email: 'omkar@gmail.com', paid: 0, owed: 500, input: 50 },
      { email: 'priya@gmail.com', paid: 1000, owed: 0, input: 0 },
      { email: 'sam@gmail.com', paid: 0, owed: 500, input: 50 },
    ])
  })

  it('returns a split that does not add up as a problem, together with the others', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    const me = await personId('omkar@gmail.com')
    const result = await expenseService.createExpense(
      db,
      personIdForEmail('omkar@gmail.com'),
      groupId,
      await input('omkar@gmail.com', groupId, {
        description: '',
        amountMinor: 1000,
        split: { method: 'exact', values: { [me]: 900 } },
      }),
    )
    expect(result).toEqual({
      ok: false,
      errors: { description: 'Enter a description.', split: 'The split no longer adds up.' },
    })
    expect(await db.select().from(expenses)).toEqual([])
  })

  it('refuses a payer who is not in the group', async () => {
    const groupId = await createGroup(omkar)
    await createGroup(priya)
    const result = await expenseService.createExpense(
      db,
      personIdForEmail('omkar@gmail.com'),
      groupId,
      await input('omkar@gmail.com', groupId, { paidBy: await personId('priya@gmail.com') }),
    )
    expect(result).toEqual({ ok: false, errors: { paidBy: 'Choose who paid.' } })
  })

  it('describes the receipt photos in the database, in order', async () => {
    const groupId = await createGroup(omkar)
    const ids = [crypto.randomUUID(), crypto.randomUUID()]
    const id = await addExpense('omkar@gmail.com', groupId, {
      receipts: [
        { id: ids[0], mimeType: 'image/jpeg', sizeBytes: 3_000_000 },
        { id: ids[1], mimeType: 'image/heic', sizeBytes: 12 },
      ],
    })

    const photos = await db.select().from(expensePhotos).orderBy(expensePhotos.position)
    expect(photos.map(({ id: photoId, expenseId, position, mimeType, sizeBytes }) => ({ photoId, expenseId, position, mimeType, sizeBytes }))).toEqual([
      { photoId: ids[0], expenseId: id, position: 0, mimeType: 'image/jpeg', sizeBytes: 3_000_000 },
      { photoId: ids[1], expenseId: id, position: 1, mimeType: 'image/heic', sizeBytes: 12 },
    ])
  })

  it('refuses more than 10 photos, or a file that is not a photo', async () => {
    const groupId = await createGroup(omkar)
    const photo = () => ({ id: crypto.randomUUID(), mimeType: 'image/jpeg', sizeBytes: 1 })
    const save = async (receipts: CreateExpenseInput['receipts']) =>
      expenseService.createExpense(db, personIdForEmail('omkar@gmail.com'), groupId, await input('omkar@gmail.com', groupId, { receipts }))

    expect((await save(Array.from({ length: 10 }, photo))).ok).toBe(true)
    expect(await save(Array.from({ length: 11 }, photo))).toEqual({
      ok: false,
      errors: { receipts: 'Add at most 10 photos.' },
    })
    expect(await save([{ ...photo(), mimeType: 'application/pdf' }])).toEqual({
      ok: false,
      errors: { receipts: 'Only photos can be added.' },
    })
  })

  it('stores empty notes as nothing', async () => {
    const groupId = await createGroup(omkar)
    const id = await addExpense('omkar@gmail.com', groupId, { notes: '   ' })
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, id))
    expect(expense.notes).toBeNull()
  })

  it('works in a group of one, where the user owes it all to themselves', async () => {
    const groupId = await createGroup(omkar)
    const id = await addExpense('omkar@gmail.com', groupId)
    const shares = await db.select().from(expenseShares).where(eq(expenseShares.expenseId, id))
    expect(shares).toHaveLength(1)
    expect(shares[0]).toMatchObject({ paidMinor: 1000, owedMinor: 1000 })
  })

  it('leaves out members who have left the group', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    await db
      .update(groupMembers)
      .set({ deletedAt: new Date() })
      .where(eq(groupMembers.personId, await personId('priya@gmail.com')))

    const id = await addExpense('omkar@gmail.com', groupId)
    const shares = await db.select().from(expenseShares).where(eq(expenseShares.expenseId, id))
    expect(shares.map((share) => share.owedMinor)).toEqual([1000])
  })

  it('returns every problem at once, one per field, and saves nothing', async () => {
    const groupId = await createGroup(omkar)
    const result = await expenseService.createExpense(db, personIdForEmail('omkar@gmail.com'), groupId, await input('omkar@gmail.com', groupId, {
      description: '   ',
      category: 'food.unknown',
      amountMinor: null,
      currency: 'XYZ',
      date: '2026-02-30',
      notes: 'a'.repeat(1001),
    }))

    expect(result).toEqual({
      ok: false,
      errors: {
        description: 'Enter a description.',
        category: 'Choose a category.',
        amountMinor: 'Enter an amount.',
        currency: 'Choose a currency.',
        date: 'Choose a date.',
        notes: 'Use at most 1000 characters.',
      },
    })
    expect(await db.select().from(expenses)).toEqual([])
  })

  it.each([
    [{ description: 'a'.repeat(101) }, 'description', 'Use at most 100 characters.'],
    [{ amountMinor: 0 }, 'amountMinor', 'Enter an amount more than 0.'],
    [{ amountMinor: -100 }, 'amountMinor', 'Enter an amount more than 0.'],
    [{ amountMinor: 1.5 }, 'amountMinor', 'Enter an amount.'],
    [{ date: '8 Oct 2026' }, 'date', 'Choose a date.'],
  ] as const)('rejects %j', async (change, field, message) => {
    const groupId = await createGroup(omkar)
    const result = await expenseService.createExpense(
      db,
      personIdForEmail('omkar@gmail.com'),
      groupId,
      await input('omkar@gmail.com', groupId, change),
    )
    expect(result).toEqual({ ok: false, errors: { [field]: message } })
  })

  it('accepts up to one billion in the currency, and no more', async () => {
    const groupId = await createGroup(omkar)
    const save = async (amountMinor: number, currency: string) =>
      expenseService.createExpense(
        db,
        personIdForEmail('omkar@gmail.com'),
        groupId,
        await input('omkar@gmail.com', groupId, { amountMinor, currency }),
      )

    expect((await save(100_000_000_000, 'INR')).ok).toBe(true)
    expect(await save(100_000_000_001, 'INR')).toEqual({
      ok: false,
      errors: { amountMinor: 'Enter at most 1,000,000,000.' },
    })
    // Yen has no decimals, so its limit is lower in minor units.
    expect((await save(1_000_000_000, 'JPY')).ok).toBe(true)
    expect((await save(1_000_000_001, 'JPY')).ok).toBe(false)
  })

  it('reports a too-large amount together with other problems', async () => {
    const groupId = await createGroup(omkar)
    const result = await expenseService.createExpense(db, personIdForEmail('omkar@gmail.com'), groupId, await input('omkar@gmail.com', groupId, {
      description: '',
      amountMinor: 100_000_000_001,
    }))
    expect(result).toEqual({
      ok: false,
      errors: {
        description: 'Enter a description.',
        amountMinor: 'Enter at most 1,000,000,000.',
      },
    })
  })

  it('reports a malformed currency as a field problem rather than failing', async () => {
    const groupId = await createGroup(omkar)
    const result = await expenseService.createExpense(db, personIdForEmail('omkar@gmail.com'), groupId, await input('omkar@gmail.com', groupId, {
      currency: 'R$',
    }))
    expect(result).toEqual({ ok: false, errors: { currency: 'Choose a currency.' } })
  })

  it('accepts any currency, not only the group\'s', async () => {
    const groupId = await createGroup(omkar)
    const id = await addExpense('omkar@gmail.com', groupId, { currency: 'JPY', amountMinor: 1500 })
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, id))
    expect(expense.currency).toBe('JPY')
  })

  it('throws for a group the user is not in, a deleted group, or an unknown user', async () => {
    const mine = await createGroup(omkar)
    const priyas = await createGroup(priya)
    await expect(expenseService.createExpense(db, personIdForEmail('omkar@gmail.com'), priyas, await input('omkar@gmail.com', priyas))).rejects.toThrow()

    const deleted = await createGroup(omkar)
    await db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, deleted))
    await expect(expenseService.createExpense(db, personIdForEmail('omkar@gmail.com'), deleted, await input('omkar@gmail.com', deleted))).rejects.toThrow()

    await expect(expenseService.createExpense(db, personIdForEmail('nobody@gmail.com'), mine, await input('omkar@gmail.com', mine))).rejects.toThrow()
    expect(await db.select().from(expenses)).toEqual([])
  })
})

describe('listExpenses', () => {
  it('is empty for a group without expenses and for an unknown user', async () => {
    const groupId = await createGroup(omkar)
    expect(await expenseService.listExpenses(db, personIdForEmail('omkar@gmail.com'), groupId)).toEqual([])
    await addExpense('omkar@gmail.com', groupId)
    expect(await expenseService.listExpenses(db, personIdForEmail('nobody@gmail.com'), groupId)).toEqual([])
  })

  it('is empty for someone who is known but not in the group', async () => {
    const groupId = await createGroup(omkar)
    await addExpense('omkar@gmail.com', groupId)
    await createGroup(priya)

    expect(await expenseService.listExpenses(db, personIdForEmail('priya@gmail.com'), groupId)).toEqual([])
  })

  it('is empty for someone who has left the group', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    await addExpense('omkar@gmail.com', groupId)
    await db.update(groupMembers).set({ deletedAt: new Date() }).where(eq(groupMembers.personId, personIdForEmail('priya@gmail.com')))

    expect(await expenseService.listExpenses(db, personIdForEmail('priya@gmail.com'), groupId)).toEqual([])
  })

  it('lists newest day first, and the latest added first within a day', async () => {
    const groupId = await createGroup(omkar)
    const added = [
      ['Old', '2026-01-05'],
      ['First today', '2026-10-08'],
      ['Middle', '2026-05-01'],
      ['Second today', '2026-10-08'],
    ]
    for (const [index, [description, date]] of added.entries()) {
      const id = await addExpense('omkar@gmail.com', groupId, { description, date })
      await addedAt(id, `2026-10-08T10:0${index}:00Z`)
    }

    const list = await expenseService.listExpenses(db, personIdForEmail('omkar@gmail.com'), groupId)
    expect(list.map((expense) => expense.description)).toEqual([
      'Second today',
      'First today',
      'Middle',
      'Old',
    ])
  })

  it('keeps an expense in its place when it is changed later', async () => {
    const groupId = await createGroup(omkar)
    const first = await addExpense('omkar@gmail.com', groupId, { description: 'First', date: '2026-10-08' })
    const second = await addExpense('omkar@gmail.com', groupId, { description: 'Second', date: '2026-10-08' })
    await addedAt(first, '2026-10-08T10:00:00Z')
    await addedAt(second, '2026-10-08T10:01:00Z')

    // The older one is changed now: it stays below the newer one.
    await changedAt(first, '2099-01-01T10:00:00Z')

    const list = await expenseService.listExpenses(db, personIdForEmail('omkar@gmail.com'), groupId)
    expect(list.map((expense) => expense.description)).toEqual(['Second', 'First'])
  })

  it('says who paid and what the viewer paid and owes', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    const id = await addExpense('omkar@gmail.com', groupId, { amountMinor: 1001 })
    const me = await personId('omkar@gmail.com')

    const [mine] = await expenseService.listExpenses(db, personIdForEmail('omkar@gmail.com'), groupId)
    expect(mine).toEqual({
      id,
      description: 'Dinner',
      category: 'food.dining_out',
      amountMinor: 1001,
      currency: 'INR',
      date: '2026-10-08',
      payer: { personId: me, email: 'omkar@gmail.com', name: 'Omkar', isYou: true },
      yourPaidMinor: 1001,
      yourOwedMinor: 501,
      involved: true,
    })

    // Priya sees the same expense from her side.
    await createTestGroup(db, priya, {
      name: 'Makes Priya a known user',
      type: 'other',
      defaultCurrency: 'INR',
      memberEmails: [],
    })
    const [hers] = await expenseService.listExpenses(db, personIdForEmail('priya@gmail.com'), groupId)
    expect(hers).toMatchObject({
      payer: { personId: me, isYou: false },
      yourPaidMinor: 0,
      yourOwedMinor: 500,
      involved: true,
    })
  })

  it('marks a member with no part in an expense as not involved', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    const id = await addExpense('omkar@gmail.com', groupId)
    // As if Priya had been left out of the split: she has no share at all.
    await db
      .update(expenseShares)
      .set({ deletedAt: new Date() })
      .where(eq(expenseShares.personId, await personId('priya@gmail.com')))

    const [row] = await expenseService.listExpenses(db, personIdForEmail('priya@gmail.com'), groupId)
    expect(row).toMatchObject({ id, yourPaidMinor: 0, yourOwedMinor: 0, involved: false })
  })

  it('lists other groups\' expenses nowhere, and deleted ones marked with who deleted them and when', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    const other = await createGroup(omkar)
    const deleted = await addExpense('omkar@gmail.com', groupId, { description: 'Deleted' })
    await addExpense('omkar@gmail.com', groupId, { description: 'Kept' })
    await addExpense('omkar@gmail.com', other, { description: 'Elsewhere' })
    const deletedAt = new Date('2026-10-20T12:00:00Z')
    await db
      .update(expenses)
      .set({ deletedAt, updatedAt: deletedAt, updatedBy: await personId('priya@gmail.com') })
      .where(eq(expenses.id, deleted))

    const list = await expenseService.listExpenses(db, personIdForEmail('omkar@gmail.com'), groupId)

    expect(list.map((expense) => expense.description).toSorted()).toEqual(['Deleted', 'Kept'])
    const gone = list.find((expense) => expense.id === deleted)
    expect(gone?.deleted).toEqual({
      by: { personId: await personId('priya@gmail.com'), email: 'priya@gmail.com', name: null, isYou: false },
      at: deletedAt,
    })
    expect(list.find((expense) => expense.description === 'Kept')?.deleted).toBeUndefined()
    // The payer and the amount are still there, to word the line.
    expect(gone).toMatchObject({ amountMinor: 1000, payer: { isYou: true } })
  })

  it('says "you" when the viewer deleted it', async () => {
    const groupId = await createGroup(omkar)
    const id = await addExpense('omkar@gmail.com', groupId)
    await expenseService.deleteExpense(db, personIdForEmail('omkar@gmail.com'), groupId, id)

    const [row] = await expenseService.listExpenses(db, personIdForEmail('omkar@gmail.com'), groupId)

    expect(row.deleted?.by.isYou).toBe(true)
  })

  it('keeps a deleted expense in its place', async () => {
    const groupId = await createGroup(omkar)
    const first = await addExpense('omkar@gmail.com', groupId, { description: 'First', date: '2026-10-08' })
    const second = await addExpense('omkar@gmail.com', groupId, { description: 'Second', date: '2026-10-08' })
    await addedAt(first, '2026-10-08T10:00:00Z')
    await addedAt(second, '2026-10-08T10:01:00Z')

    await expenseService.deleteExpense(db, personIdForEmail('omkar@gmail.com'), groupId, first)

    const list = await expenseService.listExpenses(db, personIdForEmail('omkar@gmail.com'), groupId)
    expect(list.map((expense) => expense.description)).toEqual(['Second', 'First'])
  })
})

describe('recentCurrencies', () => {
  it('lists the currencies of the user\'s latest expenses, each once, at most three', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    expect(await expenseService.recentCurrencies(db, personIdForEmail('omkar@gmail.com'))).toEqual([])

    for (const [index, currency] of ['USD', 'EUR', 'INR', 'GBP', 'EUR'].entries()) {
      const id = await addExpense('omkar@gmail.com', groupId, { currency })
      await changedAt(id, `2026-10-08T10:0${index}:00Z`)
    }
    expect(await expenseService.recentCurrencies(db, personIdForEmail('omkar@gmail.com'))).toEqual([
      'EUR',
      'GBP',
      'INR',
    ])
  })

  it('counts only the user\'s own expenses, and no deleted ones', async () => {
    const groupId = await createGroup(priya, ['omkar@gmail.com'])
    await addExpense('priya@gmail.com', groupId, { currency: 'JPY', amountMinor: 100 })
    const deleted = await addExpense('omkar@gmail.com', groupId, { currency: 'USD' })
    await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, deleted))

    expect(await expenseService.recentCurrencies(db, personIdForEmail('omkar@gmail.com'))).toEqual([])
    expect(await expenseService.recentCurrencies(db, personIdForEmail('nobody@gmail.com'))).toEqual([])
  })
})

describe('groupBalances', () => {
  it('is empty with no expenses, and for an unknown user', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    expect(await expenseService.groupBalances(db, personIdForEmail('omkar@gmail.com'), groupId)).toEqual([])
    await addExpense('omkar@gmail.com', groupId)
    expect(await expenseService.groupBalances(db, personIdForEmail('nobody@gmail.com'), groupId)).toEqual([])
  })

  it('says what each other member owes you, or you owe them, per currency', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com', 'sam@gmail.com'])
    // Priya joins the app (she is then a known user who can add expenses).
    await db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))

    await addExpense('omkar@gmail.com', groupId, { amountMinor: 900, currency: 'GBP' })
    await addExpense('priya@gmail.com', groupId, { amountMinor: 3000, currency: 'INR' })
    await addExpense('priya@gmail.com', groupId, { amountMinor: 600, currency: 'GBP' })

    const balances = await expenseService.groupBalances(db, personIdForEmail('omkar@gmail.com'), groupId)
    expect(balances.map(({ email, name, currency, amountMinor }) => ({ email, name, currency, amountMinor }))).toEqual([
      // GBP: Priya owes 300 for the first, you owe her 200 for the third.
      { email: 'priya@gmail.com', name: 'Priya Shah', currency: 'GBP', amountMinor: 100 },
      { email: 'priya@gmail.com', name: 'Priya Shah', currency: 'INR', amountMinor: -1000 },
      { email: 'sam@gmail.com', name: null, currency: 'GBP', amountMinor: 300 },
    ])
  })

  it('leaves out settled pairs, deleted expenses and other groups', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    const other = await createGroup(omkar, ['priya@gmail.com'])
    await addExpense('omkar@gmail.com', groupId, { amountMinor: 1000 })
    await addExpense('priya@gmail.com', groupId, { amountMinor: 1000 })
    const deleted = await addExpense('omkar@gmail.com', groupId, { amountMinor: 5000 })
    await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, deleted))
    await addExpense('omkar@gmail.com', other, { amountMinor: 7000 })

    expect(await expenseService.groupBalances(db, personIdForEmail('omkar@gmail.com'), groupId)).toEqual([])
    expect(await expenseService.groupBalances(db, personIdForEmail('omkar@gmail.com'), other)).toHaveLength(1)
  })

  it('leaves out deleted shares', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    const id = await addExpense('omkar@gmail.com', groupId, { amountMinor: 1000 })
    await db
      .update(expenseShares)
      .set({ deletedAt: new Date() })
      .where(and(eq(expenseShares.expenseId, id), eq(expenseShares.personId, await personId('priya@gmail.com'))))

    expect(await expenseService.groupBalances(db, personIdForEmail('omkar@gmail.com'), groupId)).toEqual([])
  })
})

describe('balancesByGroup', () => {
  it('nets the user\'s balance per group and currency, leaving out zeros', async () => {
    const goa = await createGroup(omkar, ['priya@gmail.com', 'sam@gmail.com'])
    const flat = await createGroup(omkar, ['priya@gmail.com'])
    const settled = await createGroup(omkar, ['priya@gmail.com'])
    await createGroup(omkar)

    await addExpense('omkar@gmail.com', goa, { amountMinor: 900, currency: 'GBP' })
    await addExpense('priya@gmail.com', goa, { amountMinor: 3000, currency: 'INR' })
    await addExpense('priya@gmail.com', flat, { amountMinor: 1001, currency: 'EUR' })
    await addExpense('omkar@gmail.com', settled, { amountMinor: 1000 })
    await addExpense('priya@gmail.com', settled, { amountMinor: 1000 })

    expect(await expenseService.balancesByGroup(db, personIdForEmail('omkar@gmail.com'))).toEqual({
      [goa]: [
        { currency: 'GBP', amountMinor: 600 },
        { currency: 'INR', amountMinor: -1000 },
      ],
      // 10.01 split in two: Priya, who paid, keeps the extra cent.
      [flat]: [{ currency: 'EUR', amountMinor: -500 }],
    })
    expect(await expenseService.balancesByGroup(db, personIdForEmail('nobody@gmail.com'))).toEqual({})
  })

  it('leaves out deleted expenses', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    const id = await addExpense('omkar@gmail.com', groupId)
    await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, id))
    expect(await expenseService.balancesByGroup(db, personIdForEmail('omkar@gmail.com'))).toEqual({})
  })
})

describe('getExpense', () => {
  it('gives the expense with each person who paid or owes, you first', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com', 'sam@gmail.com', 'ana@gmail.com'])
    const [me, priyaId, samId] = await Promise.all(
      ['omkar@gmail.com', 'priya@gmail.com', 'sam@gmail.com'].map(personId),
    )
    const id = await addExpense('omkar@gmail.com', groupId, {
      description: 'Dinner',
      notes: 'Card',
      amountMinor: 900,
      paidBy: samId,
      split: { method: 'shares', values: { [me]: 1, [priyaId]: 2 } },
    })

    const details = await expenseService.getExpense(db, personIdForEmail('omkar@gmail.com'), groupId, id)

    expect(details).toEqual({
      id,
      groupId,
      description: 'Dinner',
      category: 'food.dining_out',
      amountMinor: 900,
      currency: 'INR',
      date: '2026-10-08',
      notes: 'Card',
      method: 'shares',
      createdBy: { email: 'omkar@gmail.com', name: 'Omkar', isYou: true },
      // Ana neither paid nor owes, so she is left out.
      shares: [
        { personId: me, email: 'omkar@gmail.com', name: 'Omkar', isYou: true, paidMinor: 0, owedMinor: 300 },
        { personId: priyaId, email: 'priya@gmail.com', name: null, isYou: false, paidMinor: 0, owedMinor: 600 },
        { personId: samId, email: 'sam@gmail.com', name: null, isYou: false, paidMinor: 900, owedMinor: 0 },
      ],
      receipts: [],
      lastEdit: null,
      deleted: null,
      createdAt: expect.any(Date),
      history: [expect.objectContaining({ kind: 'added' })],
      people: {},
    })
  })

  it('lists the receipt photos in the order they were added, leaving out deleted ones', async () => {
    const groupId = await createGroup(omkar)
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
    const id = await addExpense('omkar@gmail.com', groupId, {
      receipts: ids.map((photoId, index) => ({ id: photoId, mimeType: index === 1 ? 'image/png' : 'image/jpeg', sizeBytes: 100 })),
    })
    await db.update(expensePhotos).set({ deletedAt: new Date() }).where(eq(expensePhotos.id, ids[2]))

    const details = await expenseService.getExpense(db, personIdForEmail('omkar@gmail.com'), groupId, id)
    expect(details?.receipts).toEqual([
      { id: ids[0], mimeType: 'image/jpeg' },
      { id: ids[1], mimeType: 'image/png' },
    ])
  })

  it('is null for an unknown or malformed expense, another group\'s, or a group you are not in', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    const other = await createGroup(omkar)
    const id = await addExpense('omkar@gmail.com', groupId)
    const priyas = await createGroup(priya)
    const hers = await addExpense('priya@gmail.com', priyas)

    const get = (group: string, expense: string, email = 'omkar@gmail.com') =>
      expenseService.getExpense(db, personIdForEmail(email), group, expense)
    expect(await get(groupId, id)).not.toBeNull()
    expect(await get(groupId, crypto.randomUUID())).toBeNull()
    expect(await get(groupId, 'not-an-id')).toBeNull()
    expect(await get(other, id)).toBeNull()
    expect(await get(priyas, hers)).toBeNull()
    expect(await get(groupId, id, 'nobody@gmail.com')).toBeNull()
  })
})

describe('createSettlement', () => {
  const omkarId = personIdForEmail(omkar.email)

  async function settlementInput(
    payer: string,
    recipient: string,
    overrides: Partial<CreateSettlementInput> = {},
  ): Promise<CreateSettlementInput> {
    return {
      payerId: await personId(payer),
      recipientId: await personId(recipient),
      amountMinor: 1000,
      currency: 'INR',
      date: '2026-10-08',
      notes: '',
      receipts: [],
      ...overrides,
    }
  }

  const balancesOf = (groupId: string, email = 'omkar@gmail.com') =>
    expenseService.groupBalances(db, personIdForEmail(email), groupId)

  it('saves the payment as a settlement expense: the payer paid it all, the recipient owes it all', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com', 'sam@gmail.com'])
    const input = await settlementInput('omkar@gmail.com', 'priya@gmail.com', {
      amountMinor: 4550,
      currency: 'GBP',
      date: '2026-10-09',
      notes: '  Cash at the airport ',
    })

    const result = await expenseService.createSettlement(db, omkarId, groupId, input)
    if (!result.ok) throw new Error(JSON.stringify(result.errors))

    const [expense] = await db.select().from(expenses).where(eq(expenses.id, result.expenseId))
    expect(expense).toMatchObject({
      groupId,
      description: 'Payment',
      category: 'settlement',
      amountMinor: 4550,
      currency: 'GBP',
      date: '2026-10-09',
      notes: 'Cash at the airport',
      method: 'exact',
      createdBy: omkarId,
      updatedBy: omkarId,
    })
    const rows = await db.select().from(expenseShares).where(eq(expenseShares.expenseId, result.expenseId))
    const byPerson = Object.fromEntries(rows.map((row) => [row.personId, [row.paidMinor, row.owedMinor]]))
    expect(byPerson).toEqual({
      [await personId('omkar@gmail.com')]: [4550, 0],
      [await personId('priya@gmail.com')]: [0, 4550],
      // Sam is in the group but not in the payment.
      [await personId('sam@gmail.com')]: [0, 0],
    })
  })

  it('settles what was owed: a part leaves the rest, all of it leaves nothing', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    // Priya paid 1000 for two, so Omkar owes her 500.
    await addExpense('priya@gmail.com', groupId, { amountMinor: 1000 })
    expect((await balancesOf(groupId)).map((balance) => balance.amountMinor)).toEqual([-500])

    await addTestSettlement(db, 'omkar@gmail.com', 'priya@gmail.com', groupId, { amountMinor: 200, currency: 'INR' })
    expect((await balancesOf(groupId)).map((balance) => balance.amountMinor)).toEqual([-300])

    await addTestSettlement(db, 'omkar@gmail.com', 'priya@gmail.com', groupId, { amountMinor: 300, currency: 'INR' })
    expect(await balancesOf(groupId)).toEqual([])
    expect(await expenseService.balancesByGroup(db, omkarId)).toEqual({})
  })

  it('turns the debt around when more than was owed is paid, and works the other way round', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    await addExpense('priya@gmail.com', groupId, { amountMinor: 1000 })

    await addTestSettlement(db, 'omkar@gmail.com', 'priya@gmail.com', groupId, { amountMinor: 800, currency: 'INR' })
    expect((await balancesOf(groupId)).map((balance) => balance.amountMinor)).toEqual([300])

    // Priya pays Omkar back, as recorded by Priya.
    await addTestSettlement(db, 'priya@gmail.com', 'omkar@gmail.com', groupId, { amountMinor: 300, currency: 'INR' })
    expect(await balancesOf(groupId)).toEqual([])
  })

  it('keeps each currency apart', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    await addExpense('priya@gmail.com', groupId, { amountMinor: 1000, currency: 'INR' })

    await addTestSettlement(db, 'omkar@gmail.com', 'priya@gmail.com', groupId, { amountMinor: 500, currency: 'GBP' })

    expect((await balancesOf(groupId)).map(({ currency, amountMinor }) => [currency, amountMinor])).toEqual([
      ['GBP', 500],
      ['INR', -500],
    ])
  })

  it('lets any member record a payment between two others, which leaves their own balance alone', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com', 'sam@gmail.com'])

    const id = await addTestSettlement(db, 'priya@gmail.com', 'sam@gmail.com', groupId, { currency: 'INR' }, 'omkar@gmail.com')

    const [expense] = await db.select().from(expenses).where(eq(expenses.id, id))
    expect(expense.createdBy).toBe(omkarId)
    expect(await balancesOf(groupId)).toEqual([])
  })

  it('shows up in the list with its payer and recipient, and only a settlement has a recipient', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    await addExpense('omkar@gmail.com', groupId, { date: '2026-10-01' })
    await addTestSettlement(db, 'priya@gmail.com', 'omkar@gmail.com', groupId, { amountMinor: 700, currency: 'INR', date: '2026-10-08' })

    const [payment, dinnerItem] = await expenseService.listExpenses(db, omkarId, groupId)

    expect(payment).toMatchObject({
      category: 'settlement',
      amountMinor: 700,
      payer: { email: 'priya@gmail.com', isYou: false },
      recipient: { email: 'omkar@gmail.com', isYou: true },
      yourPaidMinor: 0,
      yourOwedMinor: 700,
    })
    expect(dinnerItem.recipient).toBeUndefined()
  })

  it('gives its details page the payer and the recipient as its only people', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com', 'sam@gmail.com'])
    const id = await addTestSettlement(db, 'omkar@gmail.com', 'priya@gmail.com', groupId, { currency: 'INR' })

    const details = await expenseService.getExpense(db, omkarId, groupId, id)

    expect(details?.shares.map(({ email, paidMinor, owedMinor }) => [email, paidMinor, owedMinor])).toEqual([
      ['omkar@gmail.com', 1000, 0],
      ['priya@gmail.com', 0, 1000],
    ])
    expect(expenseService.titleOf(details!)).toBe('You paid Priya')
  })

  it('is not offered the settlement category as an ordinary expense\'s choice, but accepts it as a category key', () => {
    expect(expenseService.settlementCategory).toBe('settlement')
    expect(expenseService.categories.some((category) => category.key === 'settlement')).toBe(true)
  })

  describe('refusing bad input', () => {
    async function refused(groupId: string, input: CreateSettlementInput) {
      const before = await db.select().from(expenses)
      const result = await expenseService.createSettlement(db, omkarId, groupId, input)
      expect((await db.select().from(expenses)).length).toBe(before.length)
      if (result.ok) throw new Error('expected a refusal')
      return result.errors
    }

    it('asks for a recipient, and saves nothing', async () => {
      const groupId = await createGroup(omkar, ['priya@gmail.com'])
      const input = await settlementInput('omkar@gmail.com', 'priya@gmail.com', { recipientId: '' })
      expect(await refused(groupId, input)).toEqual({ recipientId: 'Choose who received it.' })
    })

    it('refuses a payer who is also the recipient, even though the numbers would add up', async () => {
      const groupId = await createGroup(omkar, ['priya@gmail.com'])
      const input = await settlementInput('omkar@gmail.com', 'omkar@gmail.com')
      expect(await refused(groupId, input)).toEqual({ recipientId: 'Choose someone other than the payer.' })
    })

    it('refuses a payer or a recipient who is not in the group', async () => {
      const groupId = await createGroup(omkar, ['priya@gmail.com'])
      await createGroup(priya, ['sam@gmail.com'])

      expect(await refused(groupId, await settlementInput('sam@gmail.com', 'priya@gmail.com'))).toEqual({
        payerId: 'Choose who paid.',
      })
      expect(await refused(groupId, await settlementInput('omkar@gmail.com', 'sam@gmail.com'))).toEqual({
        recipientId: 'Choose someone from the group.',
      })
      expect(await refused(groupId, await settlementInput('omkar@gmail.com', 'priya@gmail.com', { payerId: '' }))).toEqual({
        payerId: 'Choose who paid.',
      })
    })

    it('reports every problem at once, one message per field', async () => {
      const groupId = await createGroup(omkar, ['priya@gmail.com'])
      const input = await settlementInput('omkar@gmail.com', 'priya@gmail.com', {
        recipientId: '',
        amountMinor: null,
        currency: 'ZZZ',
        date: '2026-02-30',
        notes: 'x'.repeat(1001),
      })

      expect(await refused(groupId, input)).toEqual({
        recipientId: 'Choose who received it.',
        amountMinor: 'Enter an amount.',
        currency: 'Choose a currency.',
        date: 'Choose a date.',
        notes: 'Use at most 1000 characters.',
      })
    })

    it('refuses an amount of 0 or less, and one over the limit', async () => {
      const groupId = await createGroup(omkar, ['priya@gmail.com'])
      const base = await settlementInput('omkar@gmail.com', 'priya@gmail.com')

      expect(await refused(groupId, { ...base, amountMinor: 0 })).toEqual({ amountMinor: 'Enter an amount more than 0.' })
      expect(await refused(groupId, { ...base, amountMinor: -5 })).toEqual({ amountMinor: 'Enter an amount more than 0.' })
      expect(await refused(groupId, { ...base, amountMinor: 1_000_000_000_00 + 1 })).toEqual({
        amountMinor: 'Enter at most 1,000,000,000.',
      })
    })

    it('throws for a user who is not in the group', async () => {
      const groupId = await createGroup(omkar, ['priya@gmail.com'])
      await createGroup(priya, ['sam@gmail.com'])
      const input = await settlementInput('omkar@gmail.com', 'priya@gmail.com')

      await expect(expenseService.createSettlement(db, await personId('sam@gmail.com'), groupId, input)).rejects.toThrow()
    })
  })

  it('keeps the receipt photos in order', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    const ids = [crypto.randomUUID(), crypto.randomUUID()]
    const id = await addTestSettlement(db, 'omkar@gmail.com', 'priya@gmail.com', groupId, {
      receipts: ids.map((photoId) => ({ id: photoId, mimeType: 'image/jpeg', sizeBytes: 10 })),
    })

    const details = await expenseService.getExpense(db, omkarId, groupId, id)
    expect(details?.receipts.map((receipt) => receipt.id)).toEqual(ids)
  })
})
