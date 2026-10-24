import { PGlite } from '@electric-sql/pglite'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { expenses, groupMembers } from '../../../db/schema.ts'
import { expenseService } from '../index.ts'
import { EXPENSE_PAGE_SIZE } from '../constants.ts'
import type { ExpenseCursor, ExpenseListItem } from '../types.ts'
import { addTestExpense, addTestSettlement } from '../../../testing/expenses.ts'
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
const omkarId = personIdForEmail('omkar@gmail.com')

async function createGroup(memberEmails: string[] = []) {
  const result = await createTestGroup(db, omkar, { name: 'Goa trip', type: 'trip', defaultCurrency: 'INR', memberEmails })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.groupId
}

/** Reads the whole list batch by batch, as the page does. */
async function readAll(groupId: string, limit: number) {
  const batches: ExpenseListItem[][] = []
  let after: ExpenseCursor | null = null
  do {
    // A cursor that does not move on would read the same batch for ever.
    if (batches.length > 100) throw new Error('the batches never end')
    const page = await expenseService.listExpensesPage(db, omkarId, groupId, { limit, after })
    batches.push(page.items)
    after = page.next
  } while (after)
  return batches
}

describe('listExpensesPage', () => {
  it('reads the first batch, then the one after it, until there is no next', async () => {
    const groupId = await createGroup()
    for (let day = 1; day <= 7; day++) await addTestExpense(db, omkar.email, groupId, { description: `Day ${day}`, date: `2026-10-0${day}` })

    const first = await expenseService.listExpensesPage(db, omkarId, groupId, { limit: 3 })
    expect(first.items.map((item) => item.description)).toEqual(['Day 7', 'Day 6', 'Day 5'])
    expect(first.next).not.toBeNull()

    const second = await expenseService.listExpensesPage(db, omkarId, groupId, { limit: 3, after: first.next })
    expect(second.items.map((item) => item.description)).toEqual(['Day 4', 'Day 3', 'Day 2'])

    const third = await expenseService.listExpensesPage(db, omkarId, groupId, { limit: 3, after: second.next })
    expect(third.items.map((item) => item.description)).toEqual(['Day 1'])
    expect(third.next).toBeNull()
  })

  it('has no next when the rows are exactly a batch, and a next when there is one more', async () => {
    const groupId = await createGroup()
    for (let i = 0; i < 3; i++) await addTestExpense(db, omkar.email, groupId, { description: `E${i}`, date: `2026-10-0${i + 1}` })
    expect((await expenseService.listExpensesPage(db, omkarId, groupId, { limit: 3 })).next).toBeNull()

    await addTestExpense(db, omkar.email, groupId, { description: 'E3', date: '2026-10-09' })
    const first = await expenseService.listExpensesPage(db, omkarId, groupId, { limit: 3 })
    expect(first.next).not.toBeNull()
    const second = await expenseService.listExpensesPage(db, omkarId, groupId, { limit: 3, after: first.next })
    expect(second.items.map((item) => item.description)).toEqual(['E0'])
    expect(second.next).toBeNull()
  })

  it('puts together, batch after batch, exactly what listExpenses returns', async () => {
    const groupId = await createGroup(['priya@gmail.com'])
    for (let i = 0; i < 11; i++) await addTestExpense(db, omkar.email, groupId, { description: `E${i}`, date: `2026-0${(i % 4) + 1}-1${i % 3}` })

    const all = await expenseService.listExpenses(db, omkarId, groupId)
    const batches = await readAll(groupId, 4)

    expect(batches.map((batch) => batch.length)).toEqual([4, 4, 3])
    expect(batches.flat()).toEqual(all)
  })

  it('never repeats or skips an expense on one day, whatever time it was added at', async () => {
    const groupId = await createGroup()
    const ids: string[] = []
    for (let i = 0; i < 9; i++) ids.push(await addTestExpense(db, omkar.email, groupId, { description: `Same day ${i}`, date: '2026-10-08' }))
    // Several added in the very same instant: only the id tells them apart.
    await db.update(expenses).set({ createdAt: new Date('2026-10-08T10:00:00.000Z') }).where(sql`${expenses.description} in ('Same day 2', 'Same day 3', 'Same day 4', 'Same day 5')`)

    const batches = await readAll(groupId, 2)

    const seen = batches.flat().map((item) => item.id)
    expect(seen).toHaveLength(9)
    expect(new Set(seen).size).toBe(9)
    expect(new Set(seen)).toEqual(new Set(ids))
  })

  it('keeps the stored time to the microsecond, which a JavaScript date would round', async () => {
    const groupId = await createGroup()
    for (let i = 0; i < 4; i++) await addTestExpense(db, omkar.email, groupId, { description: `Micro ${i}`, date: '2026-10-08' })
    // Within one millisecond of each other, as rows made by the database's own `now()` can be.
    await pg.exec(`update expenses set created_at = timestamptz '2026-10-08 10:00:00.123400+00' where description = 'Micro 0'`)
    await pg.exec(`update expenses set created_at = timestamptz '2026-10-08 10:00:00.123900+00' where description = 'Micro 1'`)
    await pg.exec(`update expenses set created_at = timestamptz '2026-10-08 10:00:00.123600+00' where description = 'Micro 2'`)
    await pg.exec(`update expenses set created_at = timestamptz '2026-10-08 10:00:00.123100+00' where description = 'Micro 3'`)

    const batches = await readAll(groupId, 1)

    expect(batches.flat().map((item) => item.description)).toEqual(['Micro 1', 'Micro 2', 'Micro 0', 'Micro 3'])
  })

  it('counts deleted expenses and payments as rows of a batch', async () => {
    const groupId = await createGroup(['priya@gmail.com'])
    const gone = await addTestExpense(db, omkar.email, groupId, { description: 'Gone', date: '2026-10-05' })
    await addTestExpense(db, omkar.email, groupId, { description: 'Kept', date: '2026-10-04' })
    await addTestSettlement(db, omkar.email, 'priya@gmail.com', groupId, { date: '2026-10-06' })
    await expenseService.deleteExpense(db, omkarId, groupId, gone)

    const first = await expenseService.listExpensesPage(db, omkarId, groupId, { limit: 2 })

    expect(first.items.map((item) => [item.description, !!item.deleted, !!item.recipient])).toEqual([
      ['Payment', false, true],
      ['Gone', true, false],
    ])
    expect(first.next).not.toBeNull()
  })

  it('does not change what the next batch holds when an expense is added meanwhile', async () => {
    const groupId = await createGroup()
    for (let day = 1; day <= 6; day++) await addTestExpense(db, omkar.email, groupId, { description: `Day ${day}`, date: `2026-10-0${day}` })
    const first = await expenseService.listExpensesPage(db, omkarId, groupId, { limit: 3 })

    await addTestExpense(db, omkar.email, groupId, { description: 'Newest', date: '2026-10-20' })
    const second = await expenseService.listExpensesPage(db, omkarId, groupId, { limit: 3, after: first.next })

    expect(second.items.map((item) => item.description)).toEqual(['Day 3', 'Day 2', 'Day 1'])
  })

  it('is empty, with no next, for someone who is not in the group or has left it', async () => {
    const groupId = await createGroup(['priya@gmail.com'])
    await addTestExpense(db, omkar.email, groupId)

    expect(await expenseService.listExpensesPage(db, personIdForEmail('nobody@gmail.com'), groupId, { limit: 3 })).toEqual({ items: [], next: null })
    await db.update(groupMembers).set({ deletedAt: new Date() }).where(eq(groupMembers.personId, personIdForEmail('priya@gmail.com')))
    expect(await expenseService.listExpensesPage(db, personIdForEmail('priya@gmail.com'), groupId, { limit: 3 })).toEqual({ items: [], next: null })
  })

  it('has no cursor at all for a group without expenses', async () => {
    const groupId = await createGroup()
    expect(await expenseService.listExpensesPage(db, omkarId, groupId, { limit: EXPENSE_PAGE_SIZE })).toEqual({ items: [], next: null })
  })

  it('reads 30 at a time by default size, and the expenses of other groups never mix in', async () => {
    const groupId = await createGroup()
    const other = await createTestGroup(db, omkar, { name: 'Other', type: 'home', defaultCurrency: 'INR', memberEmails: [] })
    if (!other.ok) throw new Error('group')
    for (let i = 0; i < 31; i++) await addTestExpense(db, omkar.email, groupId, { description: `E${i}`, date: '2026-10-08' })
    await addTestExpense(db, omkar.email, other.groupId, { description: 'Elsewhere', date: '2026-10-09' })

    expect(EXPENSE_PAGE_SIZE).toBe(30)
    const first = await expenseService.listExpensesPage(db, omkarId, groupId, { limit: EXPENSE_PAGE_SIZE })
    expect(first.items).toHaveLength(30)
    expect(first.items.some((item) => item.description === 'Elsewhere')).toBe(false)
    const second = await expenseService.listExpensesPage(db, omkarId, groupId, { limit: EXPENSE_PAGE_SIZE, after: first.next })
    expect(second.items).toHaveLength(1)
  })
})
