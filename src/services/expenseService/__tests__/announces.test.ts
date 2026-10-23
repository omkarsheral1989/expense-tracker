import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { dataChanges } from '../../../db/changes.ts'
import { expenseInput, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { expenseService } from '../index.ts'

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
  await pg.exec('truncate expense_photos, expense_shares, expenses, group_members, groups, people cascade')
  stop = dataChanges.subscribe(heard)
})
afterEach(() => {
  stop()
  heard.mockReset()
})

const omkar = { email: 'omkar@gmail.com', name: 'Omkar Sheral' }

async function setUp() {
  const group = await createTestGroup(db, omkar, { name: 'Goa trip', type: 'trip', defaultCurrency: 'INR', memberEmails: ['priya@gmail.com'] })
  if (!group.ok) throw new Error('group')
  const userId = await personIdOf(db, omkar.email)
  const input = await expenseInput(db, omkar.email, group.groupId)
  const created = await expenseService.createExpense(db, userId, group.groupId, input)
  if (!created.ok) throw new Error('create')
  heard.mockReset()
  return { groupId: group.groupId, userId, input, expenseId: created.expenseId, priyaId: await personIdOf(db, 'priya@gmail.com') }
}

describe('expense actions tell the app the data changed', () => {
  it('announces once after each action that changes an expense', async () => {
    const { groupId, userId, input, expenseId, priyaId } = await setUp()

    await expenseService.updateExpense(db, userId, groupId, expenseId, { ...input, amountMinor: 2000 })
    expect(heard).toHaveBeenCalledTimes(1)
    await expenseService.deleteExpense(db, userId, groupId, expenseId)
    expect(heard).toHaveBeenCalledTimes(2)
    await expenseService.restoreExpense(db, userId, groupId, expenseId)
    expect(heard).toHaveBeenCalledTimes(3)
    await expenseService.createExpense(db, userId, groupId, input)
    expect(heard).toHaveBeenCalledTimes(4)
    await expenseService.createSettlement(db, userId, groupId, {
      payerId: priyaId,
      recipientId: userId,
      amountMinor: 500,
      currency: 'INR',
      date: '2026-10-08',
      notes: '',
      receipts: [],
    })
    expect(heard).toHaveBeenCalledTimes(5)
  })

  it('announces after going back to a version', async () => {
    const { groupId, userId, input, expenseId } = await setUp()
    await expenseService.updateExpense(db, userId, groupId, expenseId, { ...input, description: 'Lunch' })
    const detail = await expenseService.getExpense(db, userId, groupId, expenseId)
    const added = detail?.history.find((entry) => entry.kind === 'added')
    heard.mockReset()

    await expenseService.restoreVersion(db, userId, groupId, expenseId, added!.id)

    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('announces nothing when an action is refused', async () => {
    const { groupId, userId, input } = await setUp()

    await expenseService.createExpense(db, userId, groupId, { ...input, description: '' })
    await expenseService.deleteExpense(db, userId, groupId, crypto.randomUUID())
    await expenseService.restoreExpense(db, userId, groupId, crypto.randomUUID())

    expect(heard).not.toHaveBeenCalled()
  })

  it('announces nothing for reads', async () => {
    const { groupId, userId, expenseId } = await setUp()
    await expenseService.getExpense(db, userId, groupId, expenseId)
    await expenseService.listExpenses(db, userId, groupId)
    expect(heard).not.toHaveBeenCalled()
  })
})
