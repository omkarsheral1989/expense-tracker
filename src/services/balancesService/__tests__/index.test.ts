import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { groupMembers, people } from '../../../db/schema.ts'
import { addTestExpense, addTestSettlement, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { expenseService } from '../../expenseService'
import { balancesService } from '../index.ts'

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

describe('balancesService.groupBalances', () => {
  it('works out each person\'s net and the fewest payments that settle it', async () => {
    const { groupId, omkarId, priyaId, samId } = await setUp()
    // Omkar pays 30.00 for the three of them, Priya pays 6.00 for the three of them.
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000 })
    await addTestExpense(db, 'priya@gmail.com', groupId, { amountMinor: 600, paidBy: priyaId })

    const balances = (await balancesService.groupBalances(db, omkarId, groupId))!

    expect(balances.groupId).toBe(groupId)
    expect(balances.currencies).toHaveLength(1)
    const [gbp] = balances.currencies
    expect(gbp.currency).toBe('GBP')
    const netOf = (id: string) => gbp.nets.find((one) => one.personId === id)?.netMinor
    expect(netOf(omkarId)).toBe(1800)
    expect(netOf(priyaId)).toBe(-600)
    expect(netOf(samId)).toBe(-1200)
    expect(gbp.transfers).toEqual([
      { fromId: samId, toId: omkarId, amountMinor: 1200 },
      { fromId: priyaId, toId: omkarId, amountMinor: 600 },
    ])
  })

  it('lists every live member, also one who is settled', async () => {
    const { groupId, omkarId } = await setUp()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000 })

    const { members } = (await balancesService.groupBalances(db, omkarId, groupId))!

    expect(members.map((member) => member.name).toSorted()).toEqual(['Omkar Sheral', 'Priya Shah', 'Sam'])
    expect(members.find((member) => member.personId === omkarId)?.isYou).toBe(true)
    expect(members.filter((member) => member.isYou)).toHaveLength(1)
  })

  it('counts payments between members, so settling up removes the debt', async () => {
    const { groupId, omkarId } = await setUp()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000 })
    await addTestSettlement(db, 'priya@gmail.com', omkar.email, groupId, { amountMinor: 1000 })

    const [gbp] = (await balancesService.groupBalances(db, omkarId, groupId))!.currencies

    expect(gbp.nets.map((one) => one.netMinor).toSorted((a, b) => a - b)).toEqual([-1000, 1000])
    expect(gbp.transfers).toHaveLength(1)
  })

  it('leaves out deleted expenses', async () => {
    const { groupId, omkarId } = await setUp()
    const gone = await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000 })
    await expenseService.deleteExpense(db, omkarId, groupId, gone)

    expect((await balancesService.groupBalances(db, omkarId, groupId))!.currencies).toEqual([])
  })

  it('has no currency once everyone is settled up', async () => {
    const { groupId, omkarId } = await setUp()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000 })
    await addTestSettlement(db, 'priya@gmail.com', omkar.email, groupId, { amountMinor: 1000 })
    await addTestSettlement(db, 'sam@gmail.com', omkar.email, groupId, { amountMinor: 1000 })

    expect((await balancesService.groupBalances(db, omkarId, groupId))!.currencies).toEqual([])
  })

  it('keeps each currency apart, the group\'s default first and the rest A to Z, never converting', async () => {
    const { groupId, omkarId } = await setUp('GBP')
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000, currency: 'USD' })
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000, currency: 'GBP' })
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000, currency: 'EUR' })

    const { currencies } = (await balancesService.groupBalances(db, omkarId, groupId))!

    expect(currencies.map((one) => one.currency)).toEqual(['GBP', 'EUR', 'USD'])
    expect(currencies.every((one) => one.transfers.every((transfer) => transfer.amountMinor === 1000))).toBe(true)
  })

  it('includes a person who left the group but still has a balance', async () => {
    const { groupId, omkarId, priyaId } = await setUp()
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000 })
    await db.update(groupMembers).set({ deletedAt: new Date() }).where(eq(groupMembers.personId, priyaId))

    const { members, currencies } = (await balancesService.groupBalances(db, omkarId, groupId))!

    expect(members.map((member) => member.personId)).toContain(priyaId)
    expect(currencies[0].transfers.some((transfer) => transfer.fromId === priyaId)).toBe(true)
  })

  it('is null for a group the user cannot see', async () => {
    const { groupId } = await setUp()
    const stranger = await createTestGroup(db, { email: 'zed@gmail.com', name: 'Zed' }, { name: 'Other', type: 'home', defaultCurrency: 'GBP', memberEmails: [] })
    if (!stranger.ok) throw new Error('group')

    expect(await balancesService.groupBalances(db, await personIdOf(db, 'zed@gmail.com'), groupId)).toBeNull()
    expect(await balancesService.groupBalances(db, await personIdOf(db, omkar.email), 'not-a-group')).toBeNull()
  })
})

describe('balancesService.userBalances', () => {
  it('shows only the user\'s own payments, so being owed overall hides what is owed to a smaller creditor', async () => {
    const { groupId, omkarId, priyaId, samId } = await setUp()
    // Sam owes Omkar 10.00; Omkar owes Priya 2.00. After simplifying, Omkar gets back 8.00 and Sam owes Priya 2.00.
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 1000, paidBy: omkarId, split: { method: 'exact', values: { [samId]: 1000 } } })
    await addTestExpense(db, 'priya@gmail.com', groupId, { amountMinor: 200, paidBy: priyaId, split: { method: 'exact', values: { [omkarId]: 200 } } })

    const mine = await balancesService.userBalances(db, omkarId, groupId)

    expect(mine.map((one) => [one.name, one.currency, one.amountMinor])).toEqual([['Sam', 'GBP', 800]])
  })

  it('has positive amounts for what others owe the user and negative for what the user owes', async () => {
    const { groupId, omkarId, priyaId } = await setUp()
    await addTestExpense(db, 'priya@gmail.com', groupId, { amountMinor: 3000, paidBy: priyaId })

    const mine = await balancesService.userBalances(db, omkarId, groupId)

    expect(mine.map((one) => [one.name, one.amountMinor])).toEqual([['Priya Shah', -1000]])
  })

  it('lists people A to Z and then currencies A to Z, with their email and name', async () => {
    const { groupId, omkarId } = await setUp('GBP')
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000, currency: 'USD' })
    await addTestExpense(db, omkar.email, groupId, { amountMinor: 3000, currency: 'EUR' })

    const mine = await balancesService.userBalances(db, omkarId, groupId)

    expect(mine.map((one) => [one.name, one.currency])).toEqual([['Priya Shah', 'EUR'], ['Priya Shah', 'USD'], ['Sam', 'EUR'], ['Sam', 'USD']])
    expect(mine[0].email).toBe('priya@gmail.com')
  })

  it('is empty when the user is settled up or cannot see the group', async () => {
    const { groupId, omkarId } = await setUp()
    expect(await balancesService.userBalances(db, omkarId, groupId)).toEqual([])
    expect(await balancesService.userBalances(db, omkarId, 'not-a-group')).toEqual([])
  })
})
