// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expenseEvents, expenses, groups } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { accountService } from '../../../services/accountService'
import { expenseService } from '../../../services/expenseService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { personIdOf } from '../../../testing/expenses.ts'
import { me, saveButton, setUpEditExpenseTests } from './helpers.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const { testDb, createGroup, addExpense, renderEdit } = setUpEditExpenseTests()

describe('the payment method on the edit-expense page (PRD 5.6a, 4.10)', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 20, 12, 0))
    user = userEvent.setup()
    useAuthStore.setState({ profile: me, token: null })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** An expense of the group (GBP, 9.00), and two accounts of the user's: a GBP bank account and an INR card. */
  async function setUp() {
    const groupId = await createGroup()
    const expenseId = await addExpense(groupId)
    const userId = await personIdOf(testDb.db, me.email)
    const save = async (input: Parameters<typeof accountService.createAccount>[2]) => {
      const result = await accountService.createAccount(testDb.db, userId, input)
      if (!result.ok) throw new Error('account not created')
      return result.accountId
    }
    const savings = await save({ kind: 'bank', name: 'Barclays Savings', currency: 'GBP' })
    const forex = await save({ kind: 'card', name: 'Forex card', currency: 'INR' })
    return { groupId, expenseId, userId, savings, forex }
  }

  async function open(groupId: string, expenseId: string) {
    const page = renderEdit(groupId, expenseId)
    await screen.findByRole('heading', { name: 'Edit expense' })
    return page
  }

  async function choose(name: string) {
    await user.click(screen.getByRole('button', { name: /^Payment method/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Payment method' })
    await user.click(within(dialog).getByRole('button', { name }))
  }

  const chargedInput = () => screen.getByRole('textbox', { name: 'Charged to the account' })

  it('opens with the payment method the expense has, and its charged amount', async () => {
    const { groupId, expenseId, forex, userId } = await setUp()
    await accountService.setPaymentMethod(testDb.db, userId, expenseId, { accountId: forex, chargedMinor: 1_200_050 })

    await open(groupId, expenseId)

    expect(screen.getByRole('button', { name: 'Payment method: Forex card' })).toBeInTheDocument()
    expect(chargedInput()).toHaveValue('12,000.50')
  })

  it('opens with an empty row for an expense that has none', async () => {
    const { groupId, expenseId } = await setUp()

    await open(groupId, expenseId)

    expect(screen.getByRole('button', { name: 'Payment method' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Charged to the account' })).not.toBeInTheDocument()
  })

  it('saves a payment method chosen now', async () => {
    const { groupId, expenseId, savings } = await setUp()
    await open(groupId, expenseId)
    await choose('Barclays Savings')

    await user.click(saveButton())
    await screen.findByText('Expense updated.')

    expect(await accountService.getPaymentMethod(testDb.db, expenseId)).toMatchObject({ accountId: savings, accountName: 'Barclays Savings' })
  })

  it('changes the account and the charged amount', async () => {
    const { groupId, expenseId, forex, savings, userId } = await setUp()
    await accountService.setPaymentMethod(testDb.db, userId, expenseId, { accountId: savings })
    await open(groupId, expenseId)
    await choose('Forex card')
    await user.type(chargedInput(), '750')

    await user.click(saveButton())
    await screen.findByText('Expense updated.')

    expect(await accountService.getPaymentMethod(testDb.db, expenseId)).toMatchObject({ accountId: forex, chargedMinor: 75000 })
  })

  it('takes it off with "None"', async () => {
    const { groupId, expenseId, savings, userId } = await setUp()
    await accountService.setPaymentMethod(testDb.db, userId, expenseId, { accountId: savings })
    await open(groupId, expenseId)
    await choose('None')

    await user.click(saveButton())
    await screen.findByText('Expense updated.')

    expect(await accountService.getPaymentMethod(testDb.db, expenseId)).toBeNull()
  })

  it('goes back to the details page, which shows the new payment method', async () => {
    const { groupId, expenseId } = await setUp()
    const page = await open(groupId, expenseId)
    await choose('Barclays Savings')

    await user.click(saveButton())

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.expense(groupId, expenseId)))
  })

  describe('changing only the payment method', () => {
    it('is the user\'s own: no history entry, the shared expense untouched, and the group does not move up', async () => {
      const { groupId, expenseId } = await setUp()
      const [expenseBefore] = await testDb.db.select().from(expenses).where(eq(expenses.id, expenseId))
      const [groupBefore] = await testDb.db.select().from(groups).where(eq(groups.id, groupId))
      const eventsBefore = await testDb.db.select().from(expenseEvents).where(eq(expenseEvents.expenseId, expenseId))
      await open(groupId, expenseId)
      await choose('Barclays Savings')

      await user.click(saveButton())
      await screen.findByText('Expense updated.')

      const [expenseAfter] = await testDb.db.select().from(expenses).where(eq(expenses.id, expenseId))
      const [groupAfter] = await testDb.db.select().from(groups).where(eq(groups.id, groupId))
      expect(expenseAfter).toEqual(expenseBefore)
      expect(groupAfter.updatedAt).toEqual(groupBefore.updatedAt)
      expect(await testDb.db.select().from(expenseEvents).where(eq(expenseEvents.expenseId, expenseId))).toEqual(eventsBefore)
    })

    it('counts as a change, so Back asks before leaving', async () => {
      const { groupId, expenseId } = await setUp()
      await open(groupId, expenseId)
      await choose('Barclays Savings')

      await user.click(screen.getByRole('button', { name: 'Back' }))

      expect(await screen.findByRole('dialog', { name: 'Discard your changes?' })).toBeInTheDocument()
    })

    it('goes straight back, with no message, when nothing was changed at all', async () => {
      const { groupId, expenseId, savings, userId } = await setUp()
      await accountService.setPaymentMethod(testDb.db, userId, expenseId, { accountId: savings })
      const page = await open(groupId, expenseId)

      await user.click(saveButton())

      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.expense(groupId, expenseId)))
      expect(screen.queryByText('Expense updated.')).not.toBeInTheDocument()
    })
  })

  it('says so, and keeps the expense\'s other changes, when the payment method cannot be saved', async () => {
    const { groupId, expenseId } = await setUp()
    await open(groupId, expenseId)
    await user.clear(screen.getByRole('textbox', { name: 'Description' }))
    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Lunch')
    await choose('Barclays Savings')
    vi.spyOn(accountService, 'setPaymentMethod').mockRejectedValue(new Error('disk full'))

    await user.click(saveButton())

    expect(await screen.findByText("Expense updated, but the payment method couldn't be saved. Edit it again to retry.")).toBeInTheDocument()
    const [expense] = await testDb.db.select().from(expenses).where(eq(expenses.id, expenseId))
    expect(expense.description).toBe('Lunch')
  })

  it('drops a payment method kept for an expense that someone else has since made theirs, when it is saved', async () => {
    const { groupId, expenseId, savings, userId } = await setUp()
    await accountService.setPaymentMethod(testDb.db, userId, expenseId, { accountId: savings })
    // Another member changed who paid: the user did not pay it any more.
    const saved = await expenseService.getExpenseToEdit(testDb.db, userId, groupId, expenseId)
    if (!saved) throw new Error('not editable')
    const priyaId = await personIdOf(testDb.db, 'priya@gmail.com')
    const moved = await expenseService.updateExpense(testDb.db, priyaId, groupId, expenseId, { ...saved, paidBy: priyaId, notes: saved.notes ?? '' })
    if (!moved.ok) throw new Error('not moved')
    await open(groupId, expenseId)
    expect(screen.queryByRole('button', { name: /^Payment method/ })).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Notes' }), ' and a tip')
    await user.click(saveButton())
    await screen.findByText('Expense updated.')

    expect(await accountService.getPaymentMethod(testDb.db, expenseId)).toBeNull()
  })

  it('removes the payment method of an expense whose payer changes to someone else', async () => {
    const { groupId, expenseId, savings, userId } = await setUp()
    await accountService.setPaymentMethod(testDb.db, userId, expenseId, { accountId: savings })
    await open(groupId, expenseId)

    await user.click(screen.getByRole('button', { name: 'you' }))
    const dialog = await screen.findByRole('dialog', { name: 'Who paid?' })
    await user.click(within(dialog).getByRole('button', { name: 'Priya Shah' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Payment method/ })).not.toBeInTheDocument())

    await user.click(saveButton())
    await screen.findByText('Expense updated.')

    expect(await accountService.getPaymentMethod(testDb.db, expenseId)).toBeNull()
  })
})
