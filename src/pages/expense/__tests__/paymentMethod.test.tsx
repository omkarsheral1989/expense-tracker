// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor } from '@testing-library/react'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { accountService } from '../../../services/accountService'
import { expenseService } from '../../../services/expenseService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense, expenseInput, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { ExpensePage } from '../index.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const testDb = setUpTestDatabase()

describe('the payment method on the expense page (PRD 5.6, 4.10)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0))
    vi.stubGlobal('navigator', { language: 'en-GB', languages: ['en-GB'] })
    useAuthStore.setState({ profile: me, token: null })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  /** A group (GBP) with Priya Shah, and an expense of $100.00 the user paid. */
  async function setUp(overrides: Parameters<typeof addTestExpense>[3] = {}) {
    const result = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
    const expenseId = await addTestExpense(testDb.db, me.email, result.groupId, { description: 'Dinner', currency: 'USD', amountMinor: 10000, ...overrides })
    return { groupId: result.groupId, expenseId, userId: await personIdOf(testDb.db, me.email) }
  }

  async function account(userId: string, input: Parameters<typeof accountService.createAccount>[2]) {
    const result = await accountService.createAccount(testDb.db, userId, input)
    if (!result.ok) throw new Error('account not created')
    return result.accountId
  }

  async function open(groupId: string, expenseId: string) {
    renderPage(<ExpensePage />, {
      path: ROUTES.expense(groupId, expenseId),
      pattern: ROUTES.expensePattern,
      routes: [ROUTES.groupPattern, ROUTES.editExpensePattern],
    })
    await screen.findByRole('list', { name: 'Who paid' })
  }

  it('says nothing about a payment method when the expense has none', async () => {
    const { groupId, expenseId } = await setUp()

    await open(groupId, expenseId)

    expect(screen.queryByText(/^Paid (with|from)/)).not.toBeInTheDocument()
  })

  it('says "Paid from … account" for a bank account', async () => {
    const { groupId, expenseId, userId } = await setUp()
    const accountId = await account(userId, { kind: 'bank', name: 'Barclays Savings', currency: 'GBP' })
    await accountService.setPaymentMethod(testDb.db, userId, expenseId, { accountId })

    await open(groupId, expenseId)

    expect(screen.getByText('Paid from Barclays Savings account')).toBeInTheDocument()
  })

  it('says "Paid with … card" for a credit card', async () => {
    const { groupId, expenseId, userId } = await setUp()
    const accountId = await account(userId, { kind: 'card', name: 'HDFC Regalia', currency: 'GBP' })
    await accountService.setPaymentMethod(testDb.db, userId, expenseId, { accountId })

    await open(groupId, expenseId)

    expect(screen.getByText('Paid with HDFC Regalia card')).toBeInTheDocument()
  })

  it('shows it under who paid and before the split, with the account\'s icon', async () => {
    const { groupId, expenseId, userId } = await setUp()
    const accountId = await account(userId, { kind: 'bank', name: 'Barclays Savings', currency: 'GBP' })
    await accountService.setPaymentMethod(testDb.db, userId, expenseId, { accountId })

    await open(groupId, expenseId)

    const paid = screen.getByRole('list', { name: 'Who paid' })
    const row = screen.getByText('Paid from Barclays Savings account')
    expect(paid.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(row.compareDocumentPosition(screen.getByText('Split equally')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(row.parentElement?.parentElement?.querySelector('.tabler-icon-building-bank')).not.toBeNull()
  })

  it('shows what the account was charged, and the rate both ways on a line of its own, when the currencies differ', async () => {
    const { groupId, expenseId, userId } = await setUp()
    const accountId = await account(userId, { kind: 'card', name: 'HDFC Regalia', currency: 'GBP' })
    await accountService.setPaymentMethod(testDb.db, userId, expenseId, { accountId, chargedMinor: 7850 })

    await open(groupId, expenseId)

    expect(screen.getByText('Charged £78.50')).toBeInTheDocument()
    const rate = screen.getByText(/^US\$1 ≈ £0\.7850\s+·\s+£1 ≈ US\$1\.27$/)
    expect(rate).not.toBe(screen.getByText('Charged £78.50'))
    expect(rate).toHaveStyle({ fontSize: '12px' })
  })

  it('has no charged line for a payment method with no charged amount', async () => {
    const { groupId, expenseId, userId } = await setUp({ currency: 'GBP' })
    const accountId = await account(userId, { kind: 'bank', name: 'Barclays Savings', currency: 'GBP' })
    await accountService.setPaymentMethod(testDb.db, userId, expenseId, { accountId })

    await open(groupId, expenseId)

    expect(screen.queryByText(/^Charged/)).not.toBeInTheDocument()
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument()
  })

  it('shows the account\'s current name', async () => {
    const { groupId, expenseId, userId } = await setUp()
    const accountId = await account(userId, { kind: 'bank', name: 'Savings', currency: 'GBP' })
    await accountService.setPaymentMethod(testDb.db, userId, expenseId, { accountId })
    await accountService.updateAccount(testDb.db, userId, accountId, { kind: 'bank', name: 'Rainy day', currency: 'GBP' })

    await open(groupId, expenseId)

    expect(screen.getByText('Paid from Rainy day account')).toBeInTheDocument()
  })

  it('is still shown on a deleted expense', async () => {
    const { groupId, expenseId, userId } = await setUp()
    const accountId = await account(userId, { kind: 'bank', name: 'Barclays Savings', currency: 'GBP' })
    await accountService.setPaymentMethod(testDb.db, userId, expenseId, { accountId })
    await expenseService.deleteExpense(testDb.db, userId, groupId, expenseId)

    await open(groupId, expenseId)

    expect(screen.getByText('Paid from Barclays Savings account')).toBeInTheDocument()
  })

  it('is not in the history, which is shared: changing it adds no entry', async () => {
    const { groupId, expenseId, userId } = await setUp()
    const accountId = await account(userId, { kind: 'bank', name: 'Barclays Savings', currency: 'GBP' })
    await accountService.setPaymentMethod(testDb.db, userId, expenseId, { accountId })
    await accountService.setPaymentMethod(testDb.db, userId, expenseId, null)
    await accountService.setPaymentMethod(testDb.db, userId, expenseId, { accountId })

    await open(groupId, expenseId)

    const history = screen.getByRole('list', { name: 'History' })
    expect([...history.children].map((entry) => entry.textContent)).toEqual([expect.stringMatching(/^You added this expense/)])
    expect(history.textContent).not.toMatch(/payment method|Barclays/i)
  })

  it('is not shown for an expense another member paid, where this device has none', async () => {
    const { groupId, userId } = await setUp()
    const priyaId = await personIdOf(testDb.db, 'priya@gmail.com')
    const created = await expenseService.createExpense(testDb.db, userId, groupId, await expenseInput(testDb.db, me.email, groupId, { paidBy: priyaId, description: 'Priya paid' }))
    if (!created.ok) throw new Error('create')

    await open(groupId, created.expenseId)

    await waitFor(() => expect(screen.queryByText(/^Paid (with|from)/)).not.toBeInTheDocument())
  })
})
