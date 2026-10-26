import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { accounts, expenseEvents, expensePayments, expenses } from '../../../db/schema.ts'
import { addTestExpense, expenseInput, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { expenseService } from '../../expenseService'
import { accountService } from '../index.ts'
import type { AccountInput } from '../types.ts'

let pg: PGlite
let db: Database

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})

afterAll(() => pg.close())

beforeEach(() => pg.exec('truncate expense_payments, accounts, expense_events, expense_photos, expense_shares, expenses, group_members, groups, people cascade'))

const omkar = { email: 'omkar@gmail.com', name: 'Omkar Sheral' }

const card: AccountInput = {
  kind: 'card',
  name: 'HDFC Regalia',
  currency: 'INR',
  statementDay: 15,
  creditLimitMinor: 10_000_000,
  spendTargetMinor: 6_000_000,
  spendTargetPeriod: 'month',
}

/** A group of two with the user in it; returns the user's id and the group's. */
async function setUp() {
  const group = await createTestGroup(db, omkar, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
  if (!group.ok) throw new Error('group')
  return { userId: await personIdOf(db, omkar.email), groupId: group.groupId, priyaId: await personIdOf(db, 'priya@gmail.com') }
}

/** Saves an account and returns its id; fails the test if it was refused. */
async function save(userId: string, input: AccountInput) {
  const result = await accountService.createAccount(db, userId, input)
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result)}`)
  return result.accountId
}

describe('accountService.createAccount', () => {
  it('saves a credit card with every option, as the user\'s own', async () => {
    const { userId } = await setUp()

    const accountId = await save(userId, card)

    const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId))
    expect(row).toMatchObject({ ...card, deletedAt: null, updatedBy: userId })
  })

  it('saves a bank account with just a name and a currency', async () => {
    const { userId } = await setUp()

    const accountId = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })

    const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId))
    expect(row).toMatchObject({ kind: 'bank', name: 'Savings', currency: 'GBP', statementDay: null, creditLimitMinor: null, spendTargetMinor: null, spendTargetPeriod: null })
  })

  it('leaves out what a bank account does not have, even when it is sent', async () => {
    const { userId } = await setUp()

    const accountId = await save(userId, { ...card, kind: 'bank', name: 'Savings' })

    const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId))
    expect(row).toMatchObject({ statementDay: null, creditLimitMinor: null, spendTargetMinor: null, spendTargetPeriod: null })
  })

  it('trims the name and its inner spaces', async () => {
    const { userId } = await setUp()

    const accountId = await save(userId, { kind: 'bank', name: '  Barclays    Savings ', currency: 'GBP' })

    const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId))
    expect(row.name).toBe('Barclays Savings')
  })

  it.each([
    ['an empty name', { name: '   ' }, { name: 'Enter a name.' }],
    ['a name over 60 characters', { name: 'x'.repeat(61) }, { name: 'Use at most 60 characters.' }],
    ['an unknown currency', { currency: 'XXQ' }, { currency: 'Choose a currency.' }],
    ['no currency', { currency: '' }, { currency: 'Choose a currency.' }],
    ['a statement day of 0', { statementDay: 0 }, { statementDay: 'Enter a day from 1 to 28.' }],
    ['a statement day of 29', { statementDay: 29 }, { statementDay: 'Enter a day from 1 to 28.' }],
    ['a fractional statement day', { statementDay: 1.5 }, { statementDay: 'Enter a day from 1 to 28.' }],
    ['a credit limit of 0', { creditLimitMinor: 0 }, { creditLimitMinor: 'Enter an amount more than 0.' }],
    ['a credit limit over a billion', { creditLimitMinor: 100_000_000_001 }, { creditLimitMinor: 'That amount is too large.' }],
    ['a spend target of 0', { spendTargetMinor: 0 }, { spendTargetMinor: 'Enter an amount more than 0.' }],
    ['a spend target with no period', { spendTargetPeriod: null }, { spendTargetPeriod: 'Choose month or quarter.' }],
  ] as const)('refuses %s, beside its own field', async (_name, change, errors) => {
    const { userId } = await setUp()

    const result = await accountService.createAccount(db, userId, { ...card, ...change })

    expect(result).toEqual({ ok: false, errors })
    expect(await db.select().from(accounts)).toEqual([])
  })

  it('shows every problem at once', async () => {
    const { userId } = await setUp()

    const result = await accountService.createAccount(db, userId, { ...card, name: '', currency: '', statementDay: 40 })

    expect(result).toEqual({
      ok: false,
      errors: { name: 'Enter a name.', currency: 'Choose a currency.', statementDay: 'Enter a day from 1 to 28.' },
    })
  })

  it('does not check a card\'s options for a bank account', async () => {
    const { userId } = await setUp()

    const result = await accountService.createAccount(db, userId, { kind: 'bank', name: 'Savings', currency: 'GBP', statementDay: 99, spendTargetMinor: 5, spendTargetPeriod: null })

    expect(result.ok).toBe(true)
  })

  it('refuses a name another account has, ignoring case and extra spaces, and names it', async () => {
    const { userId } = await setUp()
    await save(userId, { kind: 'bank', name: 'Barclays Savings', currency: 'GBP' })

    const result = await accountService.createAccount(db, userId, { kind: 'bank', name: 'barclays   SAVINGS', currency: 'GBP' })

    expect(result).toEqual({ ok: false, errors: { name: 'You already have an account called Barclays Savings.' } })
  })

  it('lets a deleted account\'s name be used again', async () => {
    const { userId } = await setUp()
    const old = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    await db.update(accounts).set({ deletedAt: new Date() }).where(eq(accounts.id, old))

    const result = await accountService.createAccount(db, userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })

    expect(result.ok).toBe(true)
  })
})

describe('accountService.updateAccount', () => {
  it('changes the name and the card options, and who changed it and when', async () => {
    const { userId } = await setUp()
    const accountId = await save(userId, card)
    const [before] = await db.select().from(accounts).where(eq(accounts.id, accountId))

    const result = await accountService.updateAccount(db, userId, accountId, {
      ...card, name: 'HDFC Infinia', statementDay: 3, creditLimitMinor: 20_000_000, spendTargetMinor: 9_000_000, spendTargetPeriod: 'quarter',
    })

    expect(result).toEqual({ ok: true, accountId })
    const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId))
    expect(row).toMatchObject({ name: 'HDFC Infinia', statementDay: 3, creditLimitMinor: 20_000_000, spendTargetMinor: 9_000_000, spendTargetPeriod: 'quarter' })
    expect(row.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime())
  })

  it('can clear an option', async () => {
    const { userId } = await setUp()
    const accountId = await save(userId, card)

    await accountService.updateAccount(db, userId, accountId, { ...card, statementDay: null, creditLimitMinor: null, spendTargetMinor: null, spendTargetPeriod: null })

    const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId))
    expect(row).toMatchObject({ statementDay: null, creditLimitMinor: null, spendTargetMinor: null, spendTargetPeriod: null })
  })

  it('writes nothing when nothing changed', async () => {
    const { userId } = await setUp()
    const accountId = await save(userId, card)
    const [before] = await db.select().from(accounts).where(eq(accounts.id, accountId))

    const result = await accountService.updateAccount(db, userId, accountId, { ...card, name: '  hdfc regalia'.replace('hdfc regalia', 'HDFC Regalia') })

    expect(result).toEqual({ ok: true, accountId })
    const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId))
    expect(row.updatedAt).toEqual(before.updatedAt)
  })

  it('keeps a card a card and a bank account a bank account, whatever type is sent', async () => {
    const { userId } = await setUp()
    const bank = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })

    await accountService.updateAccount(db, userId, bank, { ...card, name: 'Savings', currency: 'GBP' })

    const [row] = await db.select().from(accounts).where(eq(accounts.id, bank))
    expect(row).toMatchObject({ kind: 'bank', statementDay: null, creditLimitMinor: null, spendTargetMinor: null })
  })

  it('does not take another account\'s name, but may change its own name\'s case', async () => {
    const { userId } = await setUp()
    const first = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    await save(userId, { kind: 'bank', name: 'Current', currency: 'GBP' })

    const taken = await accountService.updateAccount(db, userId, first, { kind: 'bank', name: 'current', currency: 'GBP' })
    const recased = await accountService.updateAccount(db, userId, first, { kind: 'bank', name: 'SAVINGS', currency: 'GBP' })

    expect(taken).toEqual({ ok: false, errors: { name: 'You already have an account called Current.' } })
    expect(recased.ok).toBe(true)
    const [row] = await db.select().from(accounts).where(eq(accounts.id, first))
    expect(row.name).toBe('SAVINGS')
  })

  it('changes the currency while no expense uses the account', async () => {
    const { userId } = await setUp()
    const accountId = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })

    const result = await accountService.updateAccount(db, userId, accountId, { kind: 'bank', name: 'Savings', currency: 'INR' })

    expect(result.ok).toBe(true)
    const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId))
    expect(row.currency).toBe('INR')
  })

  it('refuses to change the currency once an expense uses the account, and changes nothing', async () => {
    const { userId, groupId } = await setUp()
    const accountId = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    const expenseId = await addTestExpense(db, omkar.email, groupId)
    await accountService.setPaymentMethod(db, userId, expenseId, { accountId })

    const result = await accountService.updateAccount(db, userId, accountId, { kind: 'bank', name: 'Renamed', currency: 'INR' })

    expect(result).toEqual({ ok: false, errors: { currency: 'Expenses use this account, so its currency cannot change.' } })
    const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId))
    expect(row).toMatchObject({ name: 'Savings', currency: 'GBP' })
  })

  it('lets the same currency through when the account is in use', async () => {
    const { userId, groupId } = await setUp()
    const accountId = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    await accountService.setPaymentMethod(db, userId, await addTestExpense(db, omkar.email, groupId), { accountId })

    const result = await accountService.updateAccount(db, userId, accountId, { kind: 'bank', name: 'Renamed', currency: 'GBP' })

    expect(result.ok).toBe(true)
  })

  it('returns field errors like createAccount', async () => {
    const { userId } = await setUp()
    const accountId = await save(userId, card)

    const result = await accountService.updateAccount(db, userId, accountId, { ...card, name: '', statementDay: 30 })

    expect(result).toEqual({ ok: false, errors: { name: 'Enter a name.', statementDay: 'Enter a day from 1 to 28.' } })
  })

  it('says not found for an unknown or deleted account', async () => {
    const { userId } = await setUp()
    const gone = await save(userId, { kind: 'bank', name: 'Old', currency: 'GBP' })
    await db.update(accounts).set({ deletedAt: new Date() }).where(eq(accounts.id, gone))

    expect(await accountService.updateAccount(db, userId, crypto.randomUUID(), card)).toEqual({ ok: false, notFound: true })
    expect(await accountService.updateAccount(db, userId, gone, card)).toEqual({ ok: false, notFound: true })
  })
})

describe('accountService.listAccounts', () => {
  it('lists the live accounts by name, ignoring case, and none that were deleted', async () => {
    const { userId } = await setUp()
    await save(userId, { kind: 'bank', name: 'savings', currency: 'GBP' })
    await save(userId, { kind: 'bank', name: 'Barclays', currency: 'GBP' })
    const gone = await save(userId, { kind: 'bank', name: 'Aardvark', currency: 'GBP' })
    await db.update(accounts).set({ deletedAt: new Date() }).where(eq(accounts.id, gone))

    const list = await accountService.listAccounts(db, userId, '2026-10-26')

    expect(list.map((account) => account.name)).toEqual(['Barclays', 'savings'])
  })

  it('has no spend for a bank account', async () => {
    const { userId } = await setUp()
    await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })

    const [account] = await accountService.listAccounts(db, userId, '2026-10-26')

    expect(account.spend).toBeNull()
  })

  it('says whether an expense uses the account', async () => {
    const { userId, groupId } = await setUp()
    const used = await save(userId, { kind: 'bank', name: 'Used', currency: 'GBP' })
    await save(userId, { kind: 'bank', name: 'Unused', currency: 'GBP' })
    await accountService.setPaymentMethod(db, userId, await addTestExpense(db, omkar.email, groupId), { accountId: used })

    const list = await accountService.listAccounts(db, userId, '2026-10-26')

    expect(list.map((account) => [account.name, account.inUse])).toEqual([['Unused', false], ['Used', true]])
  })

  it('works out a card\'s periods from its statement day and target', async () => {
    const { userId } = await setUp()
    await save(userId, { ...card, currency: 'GBP' })

    const [account] = await accountService.listAccounts(db, userId, '2026-10-26')

    expect(account.spend).toEqual({
      cycle: { start: '2026-10-15', end: '2026-11-14' },
      cycleSpentMinor: 0,
      target: { start: '2026-10-15', end: '2026-11-14', period: 'month' },
      targetSpentMinor: 0,
      skipped: 0,
    })
  })

  it('has no target period for a card with no target', async () => {
    const { userId } = await setUp()
    await save(userId, { kind: 'card', name: 'Plain', currency: 'GBP' })

    const [account] = await accountService.listAccounts(db, userId, '2026-10-26')

    expect(account.spend).toMatchObject({ target: null, targetSpentMinor: 0, cycle: { start: '2026-10-01', end: '2026-10-31' } })
  })

  describe('spend', () => {
    /** A GBP card with a quarterly target, a statement day of 15 and a limit. */
    async function setUpCard() {
      const context = await setUp()
      const accountId = await save(context.userId, { ...card, currency: 'GBP', spendTargetPeriod: 'quarter' })
      return { ...context, accountId }
    }

    async function spendOn(userId: string, today = '2026-11-20') {
      const [account] = await accountService.listAccounts(db, userId, today)
      return account.spend!
    }

    /** An expense paid with the card, on a day, in a currency, with an optional charged amount. */
    async function pay(context: { userId: string; groupId: string; accountId: string }, overrides: Parameters<typeof addTestExpense>[3], chargedMinor?: number) {
      const expenseId = await addTestExpense(db, omkar.email, context.groupId, overrides)
      const result = await accountService.setPaymentMethod(db, context.userId, expenseId, { accountId: context.accountId, chargedMinor })
      if (!result.ok) throw new Error('not saved')
      return expenseId
    }

    it('adds up what the user paid in the card\'s currency, in the cycle and in the target\'s period', async () => {
      const context = await setUpCard()
      await pay(context, { amountMinor: 1000, date: '2026-11-16' })
      await pay(context, { amountMinor: 2500, date: '2026-10-20' })

      const spend = await spendOn(context.userId)

      // The cycle is 15 Nov to 14 Dec; the quarter is 15 Oct to 14 Jan.
      expect(spend.cycleSpentMinor).toBe(1000)
      expect(spend.targetSpentMinor).toBe(3500)
      expect(spend.skipped).toBe(0)
    })

    it('leaves out an expense dated before the period, or after it', async () => {
      const context = await setUpCard()
      await pay(context, { amountMinor: 700, date: '2026-10-14' })
      await pay(context, { amountMinor: 800, date: '2027-01-15' })

      const spend = await spendOn(context.userId)

      expect(spend.targetSpentMinor).toBe(0)
      expect(spend.cycleSpentMinor).toBe(0)
    })

    it('counts the full amount the user paid, not their share', async () => {
      const context = await setUpCard()
      await pay(context, { amountMinor: 4000, date: '2026-11-16' })

      const spend = await spendOn(context.userId)

      expect(spend.cycleSpentMinor).toBe(4000)
    })

    it('counts the charged amount of an expense in another currency, and skips one without', async () => {
      const context = await setUpCard()
      await pay(context, { amountMinor: 10000, currency: 'USD', date: '2026-11-16' }, 7850)
      await pay(context, { amountMinor: 5000, currency: 'USD', date: '2026-11-17' })

      const spend = await spendOn(context.userId)

      expect(spend.cycleSpentMinor).toBe(7850)
      expect(spend.skipped).toBe(1)
    })

    it('does not count a deleted expense', async () => {
      const context = await setUpCard()
      const expenseId = await pay(context, { amountMinor: 1000, date: '2026-11-16' })
      await expenseService.deleteExpense(db, context.userId, context.groupId, expenseId)

      const spend = await spendOn(context.userId)

      expect(spend.cycleSpentMinor).toBe(0)
    })

    it('counts an expense again once it is restored', async () => {
      const context = await setUpCard()
      const expenseId = await pay(context, { amountMinor: 1000, date: '2026-11-16' })
      await expenseService.deleteExpense(db, context.userId, context.groupId, expenseId)
      await expenseService.restoreExpense(db, context.userId, context.groupId, expenseId)

      expect((await spendOn(context.userId)).cycleSpentMinor).toBe(1000)
    })

    it('does not count an expense whose payment method was cleared', async () => {
      const context = await setUpCard()
      const expenseId = await pay(context, { amountMinor: 1000, date: '2026-11-16' })
      await accountService.setPaymentMethod(db, context.userId, expenseId, null)

      expect((await spendOn(context.userId)).cycleSpentMinor).toBe(0)
    })

    it('counts the card\'s own expenses only, not another account\'s', async () => {
      const context = await setUpCard()
      const other = await save(context.userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
      const expenseId = await addTestExpense(db, omkar.email, context.groupId, { amountMinor: 999, date: '2026-11-16' })
      await accountService.setPaymentMethod(db, context.userId, expenseId, { accountId: other })

      expect((await spendOn(context.userId)).cycleSpentMinor).toBe(0)
    })
  })
})

describe('accountService.setPaymentMethod', () => {
  it('sets the payment method of an expense the user paid', async () => {
    const { userId, groupId } = await setUp()
    const accountId = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    const expenseId = await addTestExpense(db, omkar.email, groupId)

    const result = await accountService.setPaymentMethod(db, userId, expenseId, { accountId })

    expect(result).toEqual({ ok: true, changed: true })
    expect(await accountService.getPaymentMethod(db, expenseId)).toEqual({
      accountId, accountName: 'Savings', accountKind: 'bank', accountCurrency: 'GBP', chargedMinor: null,
    })
  })

  it('keeps the amount the account was debited when the currency differs', async () => {
    const { userId, groupId } = await setUp()
    const accountId = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    const expenseId = await addTestExpense(db, omkar.email, groupId, { currency: 'USD', amountMinor: 10000 })

    await accountService.setPaymentMethod(db, userId, expenseId, { accountId, chargedMinor: 7850 })

    expect(await accountService.getPaymentMethod(db, expenseId)).toMatchObject({ chargedMinor: 7850 })
  })

  it('drops a charged amount when the account and the expense are in one currency', async () => {
    const { userId, groupId } = await setUp()
    const accountId = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    const expenseId = await addTestExpense(db, omkar.email, groupId, { currency: 'GBP' })

    await accountService.setPaymentMethod(db, userId, expenseId, { accountId, chargedMinor: 5 })

    expect(await accountService.getPaymentMethod(db, expenseId)).toMatchObject({ chargedMinor: null })
  })

  it.each([0, -5, 100_000_000_001])('refuses a charged amount of %s', async (chargedMinor) => {
    const { userId, groupId } = await setUp()
    const accountId = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    const expenseId = await addTestExpense(db, omkar.email, groupId, { currency: 'USD' })

    const result = await accountService.setPaymentMethod(db, userId, expenseId, { accountId, chargedMinor })

    expect(result).toEqual({ ok: false, errors: { chargedMinor: 'Enter an amount more than 0.' } })
    expect(await accountService.getPaymentMethod(db, expenseId)).toBeNull()
  })

  it('changes it to another account or amount, keeping one row for the expense', async () => {
    const { userId, groupId } = await setUp()
    const first = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    const second = await save(userId, { kind: 'card', name: 'Visa', currency: 'GBP' })
    const expenseId = await addTestExpense(db, omkar.email, groupId, { currency: 'USD' })
    await accountService.setPaymentMethod(db, userId, expenseId, { accountId: first, chargedMinor: 100 })

    const result = await accountService.setPaymentMethod(db, userId, expenseId, { accountId: second, chargedMinor: 200 })

    expect(result).toEqual({ ok: true, changed: true })
    expect(await accountService.getPaymentMethod(db, expenseId)).toMatchObject({ accountName: 'Visa', chargedMinor: 200 })
    expect(await db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId))).toHaveLength(1)
  })

  it('says nothing changed when the same thing is set again, and writes nothing', async () => {
    const { userId, groupId } = await setUp()
    const accountId = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    const expenseId = await addTestExpense(db, omkar.email, groupId)
    await accountService.setPaymentMethod(db, userId, expenseId, { accountId })
    const [before] = await db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId))

    const result = await accountService.setPaymentMethod(db, userId, expenseId, { accountId })

    expect(result).toEqual({ ok: true, changed: false })
    const [row] = await db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId))
    expect(row.updatedAt).toEqual(before.updatedAt)
  })

  it('clears it with null, softly, and can set it again', async () => {
    const { userId, groupId } = await setUp()
    const accountId = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    const expenseId = await addTestExpense(db, omkar.email, groupId)
    await accountService.setPaymentMethod(db, userId, expenseId, { accountId })

    const cleared = await accountService.setPaymentMethod(db, userId, expenseId, null)

    expect(cleared).toEqual({ ok: true, changed: true })
    expect(await accountService.getPaymentMethod(db, expenseId)).toBeNull()
    const [row] = await db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId))
    expect(row.deletedAt).not.toBeNull()

    await accountService.setPaymentMethod(db, userId, expenseId, { accountId })
    expect(await accountService.getPaymentMethod(db, expenseId)).toMatchObject({ accountName: 'Savings' })
    expect((await db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId)))[0].deletedAt).toBeNull()
  })

  it('says nothing changed when clearing what was never set', async () => {
    const { userId, groupId } = await setUp()
    const expenseId = await addTestExpense(db, omkar.email, groupId)

    expect(await accountService.setPaymentMethod(db, userId, expenseId, null)).toEqual({ ok: true, changed: false })
    expect(await db.select().from(expensePayments)).toEqual([])
  })

  it('refuses an expense the user did not pay', async () => {
    const { userId, groupId, priyaId } = await setUp()
    const accountId = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    const input = await expenseInput(db, omkar.email, groupId, { paidBy: priyaId })
    const created = await expenseService.createExpense(db, userId, groupId, input)
    if (!created.ok) throw new Error('create')

    expect(await accountService.setPaymentMethod(db, userId, created.expenseId, { accountId })).toEqual({ ok: false, notFound: true })
    expect(await db.select().from(expensePayments)).toEqual([])
  })

  it('refuses an unknown or deleted expense, and an unknown or deleted account', async () => {
    const { userId, groupId } = await setUp()
    const accountId = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    const expenseId = await addTestExpense(db, omkar.email, groupId)
    const gone = await save(userId, { kind: 'bank', name: 'Gone', currency: 'GBP' })
    await db.update(accounts).set({ deletedAt: new Date() }).where(eq(accounts.id, gone))

    expect(await accountService.setPaymentMethod(db, userId, crypto.randomUUID(), { accountId })).toEqual({ ok: false, notFound: true })
    expect(await accountService.setPaymentMethod(db, userId, expenseId, { accountId: crypto.randomUUID() })).toEqual({ ok: false, notFound: true })
    expect(await accountService.setPaymentMethod(db, userId, expenseId, { accountId: gone })).toEqual({ ok: false, notFound: true })
    await expenseService.deleteExpense(db, userId, groupId, expenseId)
    expect(await accountService.setPaymentMethod(db, userId, expenseId, { accountId })).toEqual({ ok: false, notFound: true })
  })

  it('is private: it leaves the shared expense, its events and its time alone', async () => {
    const { userId, groupId } = await setUp()
    const accountId = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    const expenseId = await addTestExpense(db, omkar.email, groupId)
    const [expenseBefore] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    const eventsBefore = await db.select().from(expenseEvents).where(eq(expenseEvents.expenseId, expenseId))

    await accountService.setPaymentMethod(db, userId, expenseId, { accountId })
    await accountService.setPaymentMethod(db, userId, expenseId, null)

    const [expenseAfter] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    expect(expenseAfter).toEqual(expenseBefore)
    expect(await db.select().from(expenseEvents).where(eq(expenseEvents.expenseId, expenseId))).toEqual(eventsBefore)
  })
})

describe('accountService.getPaymentMethod', () => {
  it('is null for an expense with none, and for one whose account was deleted', async () => {
    const { userId, groupId } = await setUp()
    const accountId = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    const expenseId = await addTestExpense(db, omkar.email, groupId)
    expect(await accountService.getPaymentMethod(db, expenseId)).toBeNull()

    await accountService.setPaymentMethod(db, userId, expenseId, { accountId })
    await db.update(accounts).set({ deletedAt: new Date() }).where(eq(accounts.id, accountId))

    expect(await accountService.getPaymentMethod(db, expenseId)).toBeNull()
  })

  it('shows the account\'s current name', async () => {
    const { userId, groupId } = await setUp()
    const accountId = await save(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    const expenseId = await addTestExpense(db, omkar.email, groupId)
    await accountService.setPaymentMethod(db, userId, expenseId, { accountId })

    await accountService.updateAccount(db, userId, accountId, { kind: 'bank', name: 'Rainy day', currency: 'GBP' })

    expect(await accountService.getPaymentMethod(db, expenseId)).toMatchObject({ accountName: 'Rainy day' })
  })
})

describe('accountService.rateLine', () => {
  // Symbols come from the device's language: these tests are written for British English ("US$", "£").
  beforeEach(() => vi.stubGlobal('navigator', { language: 'en-GB', languages: ['en-GB'] }))
  afterEach(() => vi.unstubAllGlobals())

  it('writes the rate both ways, each with its own symbol', () => {
    const line = accountService.rateLine({ amountMinor: 10000, currency: 'USD' }, { minor: 7850, currency: 'GBP' })

    expect(line).toMatch(/^US\$1 ≈ £0\.7850\s+·\s+£1 ≈ US\$1\.27$/)
  })

  it('gives the dot room on both sides', () => {
    const line = accountService.rateLine({ amountMinor: 10000, currency: 'USD' }, { minor: 7850, currency: 'GBP' })!

    expect(line).toContain('  ·  ')
  })

  it('writes a currency with no symbol as its code and a space', () => {
    const line = accountService.rateLine({ amountMinor: 10000, currency: 'USD' }, { minor: 54400, currency: 'ANG' })

    expect(line).toMatch(/ANG 5\.44/)
    expect(line).toMatch(/ANG 1 ≈ US\$0\.1838$/)
  })

  it('is null without both amounts', () => {
    expect(accountService.rateLine({ amountMinor: 0, currency: 'USD' }, { minor: 7850, currency: 'GBP' })).toBeNull()
    expect(accountService.rateLine({ amountMinor: 10000, currency: 'USD' }, { minor: 0, currency: 'GBP' })).toBeNull()
  })
})
