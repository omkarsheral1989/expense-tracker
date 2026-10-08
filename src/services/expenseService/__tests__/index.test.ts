import { PGlite } from '@electric-sql/pglite'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { expenseShares, expenses, groupMembers, groups, people } from '../../../db/schema.ts'
import { groupService } from '../../groupService'
import type { Creator } from '../../groupService/types.ts'
import { expenseService } from '../index.ts'
import type { CreateExpenseInput } from '../types.ts'
import { addTestExpense, expenseInput } from '../../../testing/expenses.ts'

let pg: PGlite
let db: Database

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})

afterAll(() => pg.close())

beforeEach(() => pg.exec('truncate expense_shares, expenses, group_members, groups, people cascade'))

const omkar: Creator = { email: 'omkar@gmail.com', name: 'Omkar' }
const priya: Creator = { email: 'priya@gmail.com', name: 'Priya' }

const dinner: Partial<CreateExpenseInput> = {
  description: 'Dinner',
  category: 'food.dining_out',
  amountMinor: 1000,
  currency: 'INR',
  date: '2026-10-08',
  notes: '',
}

async function createGroup(creator: Creator, memberEmails: string[] = []) {
  const result = await groupService.createGroup(db, creator, {
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
      'omkar@gmail.com',
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
      'omkar@gmail.com',
      groupId,
      await input('omkar@gmail.com', groupId, { paidBy: await personId('priya@gmail.com') }),
    )
    expect(result).toEqual({ ok: false, errors: { paidBy: 'Choose who paid.' } })
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
    const result = await expenseService.createExpense(db, 'omkar@gmail.com', groupId, await input('omkar@gmail.com', groupId, {
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
      'omkar@gmail.com',
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
        'omkar@gmail.com',
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
    const result = await expenseService.createExpense(db, 'omkar@gmail.com', groupId, await input('omkar@gmail.com', groupId, {
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
    const result = await expenseService.createExpense(db, 'omkar@gmail.com', groupId, await input('omkar@gmail.com', groupId, {
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
    await expect(expenseService.createExpense(db, 'omkar@gmail.com', priyas, await input('omkar@gmail.com', priyas))).rejects.toThrow()

    const deleted = await createGroup(omkar)
    await db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, deleted))
    await expect(expenseService.createExpense(db, 'omkar@gmail.com', deleted, await input('omkar@gmail.com', deleted))).rejects.toThrow()

    await expect(expenseService.createExpense(db, 'nobody@gmail.com', mine, await input('omkar@gmail.com', mine))).rejects.toThrow()
    expect(await db.select().from(expenses)).toEqual([])
  })
})

describe('listExpenses', () => {
  it('is empty for a group without expenses and for an unknown user', async () => {
    const groupId = await createGroup(omkar)
    expect(await expenseService.listExpenses(db, 'omkar@gmail.com', groupId)).toEqual([])
    await addExpense('omkar@gmail.com', groupId)
    expect(await expenseService.listExpenses(db, 'nobody@gmail.com', groupId)).toEqual([])
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
      await changedAt(id, `2026-10-08T10:0${index}:00Z`)
    }

    const list = await expenseService.listExpenses(db, 'omkar@gmail.com', groupId)
    expect(list.map((expense) => expense.description)).toEqual([
      'Second today',
      'First today',
      'Middle',
      'Old',
    ])
  })

  it('says who paid and what the viewer paid and owes', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    const id = await addExpense('omkar@gmail.com', groupId, { amountMinor: 1001 })
    const me = await personId('omkar@gmail.com')

    const [mine] = await expenseService.listExpenses(db, 'omkar@gmail.com', groupId)
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
    await groupService.createGroup(db, priya, {
      name: 'Makes Priya a known user',
      type: 'other',
      defaultCurrency: 'INR',
      memberEmails: [],
    })
    const [hers] = await expenseService.listExpenses(db, 'priya@gmail.com', groupId)
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

    const [row] = await expenseService.listExpenses(db, 'priya@gmail.com', groupId)
    expect(row).toMatchObject({ id, yourPaidMinor: 0, yourOwedMinor: 0, involved: false })
  })

  it('leaves out deleted expenses and other groups\' expenses', async () => {
    const groupId = await createGroup(omkar)
    const other = await createGroup(omkar)
    const deleted = await addExpense('omkar@gmail.com', groupId, { description: 'Deleted' })
    await addExpense('omkar@gmail.com', groupId, { description: 'Kept' })
    await addExpense('omkar@gmail.com', other, { description: 'Elsewhere' })
    await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, deleted))

    const list = await expenseService.listExpenses(db, 'omkar@gmail.com', groupId)
    expect(list.map((expense) => expense.description)).toEqual(['Kept'])
  })
})

describe('recentCurrencies', () => {
  it('lists the currencies of the user\'s latest expenses, each once, at most three', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    expect(await expenseService.recentCurrencies(db, 'omkar@gmail.com')).toEqual([])

    for (const [index, currency] of ['USD', 'EUR', 'INR', 'GBP', 'EUR'].entries()) {
      const id = await addExpense('omkar@gmail.com', groupId, { currency })
      await changedAt(id, `2026-10-08T10:0${index}:00Z`)
    }
    expect(await expenseService.recentCurrencies(db, 'omkar@gmail.com')).toEqual([
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

    expect(await expenseService.recentCurrencies(db, 'omkar@gmail.com')).toEqual([])
    expect(await expenseService.recentCurrencies(db, 'nobody@gmail.com')).toEqual([])
  })
})

describe('groupBalances', () => {
  it('is empty with no expenses, and for an unknown user', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    expect(await expenseService.groupBalances(db, 'omkar@gmail.com', groupId)).toEqual([])
    await addExpense('omkar@gmail.com', groupId)
    expect(await expenseService.groupBalances(db, 'nobody@gmail.com', groupId)).toEqual([])
  })

  it('says what each other member owes you, or you owe them, per currency', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com', 'sam@gmail.com'])
    // Priya joins the app (she is then a known user who can add expenses).
    await db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))

    await addExpense('omkar@gmail.com', groupId, { amountMinor: 900, currency: 'GBP' })
    await addExpense('priya@gmail.com', groupId, { amountMinor: 3000, currency: 'INR' })
    await addExpense('priya@gmail.com', groupId, { amountMinor: 600, currency: 'GBP' })

    const balances = await expenseService.groupBalances(db, 'omkar@gmail.com', groupId)
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

    expect(await expenseService.groupBalances(db, 'omkar@gmail.com', groupId)).toEqual([])
    expect(await expenseService.groupBalances(db, 'omkar@gmail.com', other)).toHaveLength(1)
  })

  it('leaves out deleted shares', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    const id = await addExpense('omkar@gmail.com', groupId, { amountMinor: 1000 })
    await db
      .update(expenseShares)
      .set({ deletedAt: new Date() })
      .where(and(eq(expenseShares.expenseId, id), eq(expenseShares.personId, await personId('priya@gmail.com'))))

    expect(await expenseService.groupBalances(db, 'omkar@gmail.com', groupId)).toEqual([])
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

    expect(await expenseService.balancesByGroup(db, 'omkar@gmail.com')).toEqual({
      [goa]: [
        { currency: 'GBP', amountMinor: 600 },
        { currency: 'INR', amountMinor: -1000 },
      ],
      // 10.01 split in two: Priya, who paid, keeps the extra cent.
      [flat]: [{ currency: 'EUR', amountMinor: -500 }],
    })
    expect(await expenseService.balancesByGroup(db, 'nobody@gmail.com')).toEqual({})
  })

  it('leaves out deleted expenses', async () => {
    const groupId = await createGroup(omkar, ['priya@gmail.com'])
    const id = await addExpense('omkar@gmail.com', groupId)
    await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, id))
    expect(await expenseService.balancesByGroup(db, 'omkar@gmail.com')).toEqual({})
  })
})
