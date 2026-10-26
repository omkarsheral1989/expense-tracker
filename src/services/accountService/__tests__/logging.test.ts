import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { addTestExpense, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { captureLogs } from '../../../testing/logs.ts'
import { accountService } from '../index.ts'

let pg: PGlite
let db: Database
const logs = captureLogs()

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})

afterAll(() => pg.close())

beforeEach(() => pg.exec('truncate expense_payments, accounts, expense_events, expense_photos, expense_shares, expenses, group_members, groups, people cascade'))

const omkar = { email: 'omkar@gmail.com', name: 'Omkar Sheral' }

async function setUp() {
  const group = await createTestGroup(db, omkar, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP' })
  if (!group.ok) throw new Error('group')
  logs.clear()
  return { userId: await personIdOf(db, omkar.email), groupId: group.groupId }
}

describe('account actions are logged', () => {
  it('logs each action once, with ids and the outcome, in order', async () => {
    const { userId, groupId } = await setUp()
    const expenseId = await addTestExpense(db, omkar.email, groupId)
    logs.clear()

    const created = await accountService.createAccount(db, userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    if (!created.ok) throw new Error('create')
    await accountService.updateAccount(db, userId, created.accountId, { kind: 'bank', name: 'Rainy day', currency: 'GBP' })
    await accountService.setPaymentMethod(db, userId, expenseId, { accountId: created.accountId })

    expect(logs.lines.map((line) => [line.level, line.scope, line.message])).toEqual([
      ['info', 'account', 'Account created'],
      ['info', 'account', 'Account updated'],
      ['info', 'account', 'Payment method set'],
    ])
    expect(logs.lines[1].fields).toMatchObject({ userId, accountId: created.accountId, ok: true })
    expect(logs.lines[2].fields).toMatchObject({ userId, expenseId, ok: true })
  })

  it('warns when an action is refused, with the number of fields in error or the reason', async () => {
    const { userId } = await setUp()

    await accountService.createAccount(db, userId, { kind: 'bank', name: '', currency: 'GBP' })
    await accountService.updateAccount(db, userId, crypto.randomUUID(), { kind: 'bank', name: 'Savings', currency: 'GBP' })

    expect(logs.lines.map((line) => [line.level, line.message])).toEqual([
      ['warn', 'Account created: refused'],
      ['warn', 'Account updated: refused'],
    ])
    expect(logs.lines[0].fields).toMatchObject({ ok: false, fieldErrors: 1 })
    expect(logs.lines[1].fields).toMatchObject({ ok: false, refusal: 'notFound' })
  })

  it('never logs names, currencies or amounts', async () => {
    const { userId, groupId } = await setUp()
    const expenseId = await addTestExpense(db, omkar.email, groupId, { currency: 'USD', amountMinor: 123456 })
    const created = await accountService.createAccount(db, userId, {
      kind: 'card', name: 'Secret Platinum', currency: 'GBP', statementDay: 17, creditLimitMinor: 777777, spendTargetMinor: 555555, spendTargetPeriod: 'month',
    })
    if (!created.ok) throw new Error('create')
    await accountService.setPaymentMethod(db, userId, expenseId, { accountId: created.accountId, chargedMinor: 98765 })

    const written = JSON.stringify(logs.lines)
    for (const secret of ['Secret Platinum', 'omkar@gmail.com', '777777', '555555', '98765', '123456']) {
      expect(written).not.toContain(secret)
    }
  })
})
