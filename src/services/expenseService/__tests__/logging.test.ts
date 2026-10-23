import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { expenseInput, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { captureLogs } from '../../../testing/logs.ts'
import { expenseService } from '../index.ts'

let pg: PGlite
let db: Database
const logs = captureLogs()

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})

afterAll(() => pg.close())

beforeEach(() => pg.exec('truncate expense_photos, expense_shares, expenses, group_members, groups, people cascade'))

const omkar = { email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const priya = { email: 'priya@gmail.com', name: 'Priya Shah' }

async function setUp() {
  const group = await createTestGroup(db, omkar, {
    name: 'Goa trip',
    type: 'trip',
    defaultCurrency: 'INR',
    memberEmails: [priya.email],
  })
  if (!group.ok) throw new Error('group')
  logs.clear()
  const userId = await personIdOf(db, omkar.email)
  return { groupId: group.groupId, userId }
}

describe('expense actions are logged', () => {
  it('logs each action once, with ids and the outcome, in order', async () => {
    const { groupId, userId } = await setUp()
    const input = await expenseInput(db, omkar.email, groupId, { description: 'Secret birthday dinner', notes: 'Surprise for Priya' })

    const created = await expenseService.createExpense(db, userId, groupId, input)
    if (!created.ok) throw new Error('create')
    const expenseId = created.expenseId
    await expenseService.updateExpense(db, userId, groupId, expenseId, { ...input, amountMinor: 2500 })
    await expenseService.deleteExpense(db, userId, groupId, expenseId)
    await expenseService.restoreExpense(db, userId, groupId, expenseId)

    expect(logs.lines.map((line) => [line.level, line.scope, line.message])).toEqual([
      ['info', 'expense', 'Expense created'],
      ['info', 'expense', 'Expense updated'],
      ['info', 'expense', 'Expense deleted'],
      ['info', 'expense', 'Expense restored'],
    ])
    expect(logs.lines[1].fields).toMatchObject({ userId, groupId, expenseId, ok: true })
  })

  it('never logs the description, notes, amounts or names', async () => {
    const { groupId, userId } = await setUp()
    const input = await expenseInput(db, omkar.email, groupId, {
      description: 'Secret birthday dinner',
      notes: 'Surprise for Priya',
      amountMinor: 123456,
    })
    await expenseService.createExpense(db, userId, groupId, input)

    const text = JSON.stringify(logs.lines)
    for (const secret of ['Secret birthday', 'Surprise', 'Priya', 'Omkar', '123456', 'omkar@gmail.com']) {
      expect(text).not.toContain(secret)
    }
  })

  it('warns, with the number of fields in error, when the input is refused', async () => {
    const { groupId, userId } = await setUp()
    const input = await expenseInput(db, omkar.email, groupId, { description: '', amountMinor: 0 })

    const result = await expenseService.createExpense(db, userId, groupId, input)

    expect(result.ok).toBe(false)
    expect(logs.lines).toHaveLength(1)
    expect(logs.lines[0]).toMatchObject({ level: 'warn', message: 'Expense created: refused' })
    expect(logs.lines[0].fields).toMatchObject({ ok: false })
    expect(logs.lines[0].fields.fieldErrors).toBeGreaterThanOrEqual(2)
  })

  it('warns that an expense was not found when deleting twice', async () => {
    const { groupId, userId } = await setUp()
    const created = await expenseService.createExpense(db, userId, groupId, await expenseInput(db, omkar.email, groupId))
    if (!created.ok) throw new Error('create')
    await expenseService.deleteExpense(db, userId, groupId, created.expenseId)
    logs.clear()

    await expenseService.deleteExpense(db, userId, groupId, created.expenseId)

    expect(logs.lines[0]).toMatchObject({ level: 'warn', message: 'Expense deleted: refused', fields: { refusal: 'notFound' } })
  })

  it('logs a payment as its own action', async () => {
    const { groupId, userId } = await setUp()
    const result = await expenseService.createSettlement(db, userId, groupId, {
      payerId: userId,
      recipientId: await personIdOf(db, priya.email),
      amountMinor: 500,
      currency: 'INR',
      date: '2026-10-08',
      notes: '',
      receipts: [],
    })
    expect(result.ok).toBe(true)
    expect(logs.lines.map((line) => line.message)).toEqual(['Payment recorded'])
  })

  it('logs and rethrows a failure of the database', async () => {
    const { groupId, userId } = await setUp()
    const closed = new PGlite()
    const closedDb = await createDatabase(closed)
    await closed.close()

    await expect(expenseService.deleteExpense(closedDb, userId, groupId, crypto.randomUUID())).rejects.toThrow()

    expect(logs.lines.at(-1)).toMatchObject({ level: 'error', message: 'Expense deleted: failed' })
  })
})
