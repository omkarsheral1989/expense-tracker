import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { dataChanges } from '../../../db/changes.ts'
import { addTestExpense, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { accountService } from '../index.ts'

let pg: PGlite
let db: Database
const heard = vi.fn()
let stop: () => void

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})
afterAll(() => pg.close())
beforeEach(async () => {
  await pg.exec('truncate expense_payments, accounts, expense_events, expense_photos, expense_shares, expenses, group_members, groups, people cascade')
  stop = dataChanges.subscribe(heard)
})
afterEach(() => {
  stop()
  heard.mockReset()
})

const omkar = { email: 'omkar@gmail.com', name: 'Omkar Sheral' }

async function setUp() {
  const group = await createTestGroup(db, omkar, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP' })
  if (!group.ok) throw new Error('group')
  const expenseId = await addTestExpense(db, omkar.email, group.groupId)
  heard.mockReset()
  return { userId: await personIdOf(db, omkar.email), expenseId }
}

describe('account actions tell the app the data changed', () => {
  it('announces once after each action that worked', async () => {
    const { userId, expenseId } = await setUp()

    const created = await accountService.createAccount(db, userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    expect(heard).toHaveBeenCalledTimes(1)
    if (!created.ok) throw new Error('create')
    await accountService.updateAccount(db, userId, created.accountId, { kind: 'bank', name: 'Rainy day', currency: 'GBP' })
    expect(heard).toHaveBeenCalledTimes(2)
    await accountService.setPaymentMethod(db, userId, expenseId, { accountId: created.accountId })
    expect(heard).toHaveBeenCalledTimes(3)
  })

  it('announces nothing when an action is refused', async () => {
    const { userId, expenseId } = await setUp()

    await accountService.createAccount(db, userId, { kind: 'bank', name: '', currency: 'GBP' })
    await accountService.updateAccount(db, userId, crypto.randomUUID(), { kind: 'bank', name: 'Savings', currency: 'GBP' })
    await accountService.setPaymentMethod(db, userId, expenseId, { accountId: crypto.randomUUID() })

    expect(heard).not.toHaveBeenCalled()
  })

  it('announces nothing for reading', async () => {
    const { userId, expenseId } = await setUp()

    await accountService.listAccounts(db, userId)
    await accountService.getPaymentMethod(db, expenseId)

    expect(heard).not.toHaveBeenCalled()
  })
})
