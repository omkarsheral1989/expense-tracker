import { PGlite } from '@electric-sql/pglite'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { groupMembers, groups, people } from '../../../db/schema.ts'
import { addTestExpense, addTestSettlement, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { expenseService } from '../../expenseService'
import { totalsService } from '../index.ts'

let pg: PGlite
let db: Database

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})
afterAll(() => pg.close())
beforeEach(() => pg.exec('truncate expense_photos, expense_shares, expenses, group_members, groups, people cascade'))

const omkar = { email: 'omkar@gmail.com', name: 'Omkar Sheral' }

async function setUp(currency = 'GBP') {
  const group = await createTestGroup(db, omkar, { name: 'Goa trip', type: 'trip', defaultCurrency: currency, memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
  if (!group.ok) throw new Error('group')
  await db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
  await db.update(people).set({ name: 'Sam' }).where(eq(people.email, 'sam@gmail.com'))
  return { groupId: group.groupId, omkarId: await personIdOf(db, omkar.email), priyaId: await personIdOf(db, 'priya@gmail.com'), samId: await personIdOf(db, 'sam@gmail.com') }
}

const amounts = (rows: { name: string | null; amountMinor: number }[]) => rows.map((row) => [row.name, row.amountMinor])

describe('totalsService.groupTotals', () => {
  it('adds up what the group spent, what each member owes and what each paid', async () => {
    const { groupId, priyaId } = await setUp()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000 })
    await addTestExpense(db, 'priya@gmail.com', groupId, { amountMinor: 1500, paidBy: priyaId })

    const totals = await totalsService.groupTotals(db, await personIdOf(db, omkar.email), groupId)

    expect(totals).toMatchObject({ groupId, defaultCurrency: 'GBP' })
    expect(totals).not.toHaveProperty('name')
    const [gbp] = totals!.currencies
    expect(gbp.currency).toBe('GBP')
    expect(gbp.totalMinor).toBe(4500)
    // Each expense is split equally between the three.
    expect(amounts(gbp.shares)).toEqual([['Omkar Sheral', 1500], ['Priya Shah', 1500], ['Sam', 1500]])
    expect(amounts(gbp.paid)).toEqual([['Omkar Sheral', 3000], ['Priya Shah', 1500], ['Sam', 0]])
  })

  it('has the shares add up to the total even when a split leaves a remainder', async () => {
    const { groupId } = await setUp()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 1000 })

    const [gbp] = (await totalsService.groupTotals(db, await personIdOf(db, omkar.email), groupId))!.currencies

    expect(gbp.shares.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(1000)
    expect(gbp.paid.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(1000)
  })

  it('leaves out payments between members and deleted expenses', async () => {
    const { groupId, omkarId } = await setUp()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000 })
    await addTestSettlement(db, 'priya@gmail.com', omkar.email, groupId, { amountMinor: 700 })
    const gone = await addTestExpense(db, omkar.email, groupId, { amountMinor: 900 })
    await expenseService.deleteExpense(db, omkarId, groupId, gone)

    const [gbp] = (await totalsService.groupTotals(db, omkarId, groupId))!.currencies

    expect(gbp.totalMinor).toBe(3000)
    expect(amounts(gbp.paid)).toEqual([['Omkar Sheral', 3000], ['Priya Shah', 0], ['Sam', 0]])
  })

  it('keeps each currency apart, the group\'s default first and the rest A to Z, never converting', async () => {
    const { groupId, omkarId } = await setUp('GBP')
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 1000, currency: 'USD' })
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 2000, currency: 'GBP' })
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 500, currency: 'EUR' })

    const { currencies } = (await totalsService.groupTotals(db, omkarId, groupId))!

    expect(currencies.map((one) => [one.currency, one.totalMinor])).toEqual([['GBP', 2000], ['EUR', 500], ['USD', 1000]])
  })

  it('gives each member\'s amounts per currency, never one currency\'s amount in another\'s list', async () => {
    const { groupId, omkarId, priyaId } = await setUp('GBP')
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000, currency: 'GBP' })
    await addTestExpense(db, 'priya@gmail.com', groupId, { amountMinor: 900, currency: 'USD', paidBy: priyaId })

    const { currencies } = (await totalsService.groupTotals(db, omkarId, groupId))!

    const [gbp, usd] = currencies
    expect(amounts(gbp.paid)).toEqual([['Omkar Sheral', 3000], ['Priya Shah', 0], ['Sam', 0]])
    expect(amounts(gbp.shares)).toEqual([['Omkar Sheral', 1000], ['Priya Shah', 1000], ['Sam', 1000]])
    expect(amounts(usd.paid)).toEqual([['Priya Shah', 900], ['Omkar Sheral', 0], ['Sam', 0]])
    expect(amounts(usd.shares)).toEqual([['Omkar Sheral', 300], ['Priya Shah', 300], ['Sam', 300]])
  })

  it('puts the currencies A to Z when the default has no expenses', async () => {
    const { groupId, omkarId } = await setUp('GBP')
    await addTestExpense(db, omkar.email, groupId, { currency: 'USD' })
    await addTestExpense(db, omkar.email, groupId, { currency: 'EUR' })

    const { currencies } = (await totalsService.groupTotals(db, omkarId, groupId))!

    expect(currencies.map((one) => one.currency)).toEqual(['EUR', 'USD'])
  })

  it('has every member in each list, also one with nothing, largest first and ties by name', async () => {
    const { groupId, omkarId, samId } = await setUp()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 900, paidBy: samId, split: { method: 'exact', values: { [omkarId]: 600, [samId]: 300, [await personIdOf(db, 'priya@gmail.com')]: 0 } } })

    const [gbp] = (await totalsService.groupTotals(db, omkarId, groupId))!.currencies

    expect(amounts(gbp.shares)).toEqual([['Omkar Sheral', 600], ['Sam', 300], ['Priya Shah', 0]])
    expect(amounts(gbp.paid)).toEqual([['Sam', 900], ['Omkar Sheral', 0], ['Priya Shah', 0]])
  })

  it('breaks a tie by the name shown, not by who the user is', async () => {
    const { groupId, omkarId } = await setUp()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 900 })

    const [gbp] = (await totalsService.groupTotals(db, omkarId, groupId))!.currencies

    // 300 each: Omkar Sheral, Priya Shah, Sam in alphabetical order, the user not first.
    expect(gbp.shares.map((row) => row.name)).toEqual(['Omkar Sheral', 'Priya Shah', 'Sam'])
    const asSam = (await totalsService.groupTotals(db, await personIdOf(db, 'sam@gmail.com'), groupId))!.currencies[0]
    expect(asSam.shares.map((row) => [row.name, row.isYou])).toEqual([['Omkar Sheral', false], ['Priya Shah', false], ['Sam', true]])
  })

  it('says who the user is, and gives each member\'s email and picture', async () => {
    const { groupId, omkarId, priyaId } = await setUp()
    await db.update(people).set({ picture: 'https://example.com/priya.png' }).where(eq(people.id, priyaId))
    await addTestExpense(db, omkar.email, groupId)

    const [gbp] = (await totalsService.groupTotals(db, omkarId, groupId))!.currencies

    const priya = gbp.shares.find((row) => row.personId === priyaId)!
    expect(priya).toMatchObject({ email: 'priya@gmail.com', picture: 'https://example.com/priya.png', isYou: false })
    expect(gbp.shares.find((row) => row.personId === omkarId)).toMatchObject({ isYou: true, picture: null })
  })

  it('also lists a person who is no longer a member but has an amount', async () => {
    const { groupId, omkarId, priyaId } = await setUp()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 900 })
    await db.update(groupMembers).set({ deletedAt: new Date() }).where(eq(groupMembers.personId, priyaId))

    const [gbp] = (await totalsService.groupTotals(db, omkarId, groupId))!.currencies

    expect(gbp.shares.map((row) => row.name)).toContain('Priya Shah')
    expect(gbp.shares.find((row) => row.name === 'Priya Shah')!.amountMinor).toBe(300)
  })

  it('has no currencies while nothing counts', async () => {
    const { groupId, omkarId } = await setUp()
    await addTestSettlement(db, 'priya@gmail.com', omkar.email, groupId)

    expect((await totalsService.groupTotals(db, omkarId, groupId))!.currencies).toEqual([])
  })

  it('is null for a group the user cannot see: unknown, malformed, deleted, or not theirs', async () => {
    const { groupId, omkarId } = await setUp()
    const outsider = await createTestGroup(db, { email: 'dev@gmail.com', name: 'Dev' }, { name: 'Other', type: 'home', defaultCurrency: 'GBP', memberEmails: [] })
    if (!outsider.ok) throw new Error('group')

    expect(await totalsService.groupTotals(db, omkarId, crypto.randomUUID())).toBeNull()
    expect(await totalsService.groupTotals(db, omkarId, 'not-a-uuid')).toBeNull()
    expect(await totalsService.groupTotals(db, omkarId, outsider.groupId)).toBeNull()
    await db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, groupId))
    expect(await totalsService.groupTotals(db, omkarId, groupId)).toBeNull()
  })

  it('does not count another group\'s expenses', async () => {
    const { groupId, omkarId } = await setUp()
    const other = await createTestGroup(db, omkar, { name: 'Other', type: 'home', defaultCurrency: 'GBP', memberEmails: [] })
    if (!other.ok) throw new Error('group')
    await addTestExpense(db, omkar.email, other.groupId, { amountMinor: 9999 })
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 1000 })

    expect((await totalsService.groupTotals(db, omkarId, groupId))!.currencies[0].totalMinor).toBe(1000)
  })

  it('sums more than one expense per person', async () => {
    const { groupId, omkarId } = await setUp()
    for (const amountMinor of [300, 600, 900]) await addTestExpense(db, omkar.email, groupId, { amountMinor })

    const [gbp] = (await totalsService.groupTotals(db, omkarId, groupId))!.currencies

    expect(gbp.totalMinor).toBe(1800)
    expect(gbp.paid.find((row) => row.isYou)!.amountMinor).toBe(1800)
  })
})

describe('totalsService.hasSpending', () => {
  it('is true once an expense counts', async () => {
    const { groupId, omkarId } = await setUp()
    expect(await totalsService.hasSpending(db, omkarId, groupId)).toBe(false)

    await addTestExpense(db, omkar.email, groupId)

    expect(await totalsService.hasSpending(db, omkarId, groupId)).toBe(true)
  })

  it('is false when there are only payments or deleted expenses', async () => {
    const { groupId, omkarId } = await setUp()
    await addTestSettlement(db, 'priya@gmail.com', omkar.email, groupId)
    const gone = await addTestExpense(db, omkar.email, groupId)
    await expenseService.deleteExpense(db, omkarId, groupId, gone)

    expect(await totalsService.hasSpending(db, omkarId, groupId)).toBe(false)
  })

  it('is false for a group the user cannot see', async () => {
    const { groupId } = await setUp()
    await addTestExpense(db, omkar.email, groupId)
    await createTestGroup(db, { email: 'dev@gmail.com', name: 'Dev' }, { name: 'Other', type: 'home', defaultCurrency: 'GBP', memberEmails: [] })
    const dev = await personIdOf(db, 'dev@gmail.com')

    expect(await totalsService.hasSpending(db, dev, groupId)).toBe(false)
    expect(await totalsService.hasSpending(db, dev, crypto.randomUUID())).toBe(false)
  })
})

describe('totalsService.spentByGroup', () => {
  async function otherGroup(name = 'Other', memberEmails: string[] = []) {
    const group = await createTestGroup(db, omkar, { name, type: 'home', defaultCurrency: 'GBP', memberEmails })
    if (!group.ok) throw new Error('group')
    return group.groupId
  }

  it('adds up what each of the user\'s groups spent, per currency, A to Z', async () => {
    const { groupId, omkarId } = await setUp()
    const solo = await otherGroup()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000, currency: 'GBP' })
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 500, currency: 'GBP' })
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 700, currency: 'EUR' })
    await addTestExpense(db, omkar.email, solo, { amountMinor: 1250, currency: 'USD' })

    const spent = await totalsService.spentByGroup(db, omkarId)

    expect(spent[groupId]).toEqual([{ currency: 'EUR', totalMinor: 700 }, { currency: 'GBP', totalMinor: 3500 }])
    expect(spent[solo]).toEqual([{ currency: 'USD', totalMinor: 1250 }])
  })

  it('leaves out payments between members and deleted expenses, and has no entry for a group with nothing that counts', async () => {
    const { groupId, omkarId } = await setUp()
    const quiet = await otherGroup('Quiet')
    await addTestSettlement(db, 'priya@gmail.com', omkar.email, groupId, { amountMinor: 900 })
    const gone = await addTestExpense(db, omkar.email, groupId, { amountMinor: 400 })
    await expenseService.deleteExpense(db, omkarId, groupId, gone)

    const spent = await totalsService.spentByGroup(db, omkarId)

    expect(spent[groupId]).toBeUndefined()
    expect(spent[quiet]).toBeUndefined()
  })

  it('counts only groups the user is in and that are not deleted', async () => {
    const { groupId, omkarId, priyaId } = await setUp()
    const mine = await otherGroup('Mine')
    const left = await otherGroup('Left', ['priya@gmail.com'])
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 100 })
    await addTestExpense(db, omkar.email, mine, { amountMinor: 200 })
    await addTestExpense(db, omkar.email, left, { amountMinor: 300 })
    await db.update(groupMembers).set({ deletedAt: new Date() }).where(and(eq(groupMembers.groupId, left), eq(groupMembers.personId, omkarId)))
    await db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, mine))

    const asOmkar = await totalsService.spentByGroup(db, omkarId)
    const asPriya = await totalsService.spentByGroup(db, priyaId)

    expect(Object.keys(asOmkar)).toEqual([groupId])
    expect(Object.keys(asPriya).sort()).toEqual([groupId, left].sort())
    expect(asPriya[left]).toEqual([{ currency: 'GBP', totalMinor: 300 }])
  })

  it('is empty for someone with no groups', async () => {
    await setUp()

    expect(await totalsService.spentByGroup(db, crypto.randomUUID())).toEqual({})
  })
})
