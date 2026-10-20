// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { expenses, people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { expenseService } from '../../../services/expenseService'
import type { CreateExpenseInput } from '../../../services/expenseService/types.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense, addTestSettlement, personIdOf } from '../../../testing/expenses.ts'
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

async function createGroup() {
  const result = await createTestGroup(testDb.db, me, {
    name: 'Goa trip',
    type: 'trip',
    defaultCurrency: 'GBP',
    memberEmails: ['priya@gmail.com', 'sam@gmail.com'],
  })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
  return result.groupId
}

function renderExpense(groupId: string, expenseId: string) {
  return renderPage(<ExpensePage />, {
    path: ROUTES.expense(groupId, expenseId),
    pattern: ROUTES.expensePattern,
    routes: [ROUTES.groupPattern, ROUTES.editExpensePattern],
  })
}

/** "Beach shack dinner", 9.00 GBP on 5 Oct 2026, paid by you and split equally. */
async function addExpense(groupId: string, overrides: Partial<CreateExpenseInput> = {}) {
  return addTestExpense(testDb.db, me.email, groupId, {
    description: 'Beach shack dinner',
    category: 'food.dining_out',
    amountMinor: 900,
    date: '2026-10-05',
    notes: 'Card',
    ...overrides,
  })
}

async function remove(email: string, groupId: string, expenseId: string) {
  const result = await expenseService.deleteExpense(testDb.db, await personIdOf(testDb.db, email), groupId, expenseId)
  if (!result.ok) throw new Error('Not deleted.')
}

const deleteButton = () => screen.getByRole('button', { name: 'Delete' })
const confirmDialog = (title: string) => screen.findByRole('dialog', { name: title })
async function storedExpense(expenseId: string) {
  const [row] = await testDb.db.select().from(expenses).where(eq(expenses.id, expenseId))
  return row
}

describe('ExpensePage: deleting', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 21, 15, 45))
    user = userEvent.setup()
    useAuthStore.setState({ profile: me, token: null })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.mocked(getDb).mockClear()
  })

  describe('the confirmation', () => {
    it('asks "Delete this expense?" with what will happen, and offers Cancel and a red Delete', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      renderExpense(id, expenseId)
      await screen.findByRole('heading', { name: 'Beach shack dinner' })

      await user.click(deleteButton())

      const dialog = await confirmDialog('Delete this expense?')
      expect(within(dialog).getByText('It will be removed from the group, and the balances will change.')).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveClass('ant-btn-dangerous')
      // Nothing is deleted by asking.
      expect((await storedExpense(expenseId)).deletedAt).toBeNull()
    })

    it('asks "Delete this payment?" for a payment between members', async () => {
      const id = await createGroup()
      const payment = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id)
      renderExpense(id, payment)
      await screen.findByRole('heading', { name: 'You paid Priya' })

      await user.click(deleteButton())

      expect(await confirmDialog('Delete this payment?')).toBeInTheDocument()
    })

    it('changes nothing on Cancel', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const page = renderExpense(id, expenseId)
      await screen.findByRole('heading', { name: 'Beach shack dinner' })
      await user.click(deleteButton())

      await user.click(within(await confirmDialog('Delete this expense?')).getByRole('button', { name: 'Cancel' }))

      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete this expense?' })).not.toBeInTheDocument())
      expect(page.currentPath()).toBe(ROUTES.expense(id, expenseId))
      expect((await storedExpense(expenseId)).deletedAt).toBeNull()
    })
  })

  describe('deleting', () => {
    it('deletes the expense, says "Expense deleted." and opens the group', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const page = renderExpense(id, expenseId)
      await screen.findByRole('heading', { name: 'Beach shack dinner' })
      await user.click(deleteButton())

      await user.click(within(await confirmDialog('Delete this expense?')).getByRole('button', { name: 'Delete' }))

      expect(await screen.findByText('Expense deleted.')).toBeInTheDocument()
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
      const stored = await storedExpense(expenseId)
      expect(stored.deletedAt).toEqual(new Date(2026, 9, 21, 15, 45))
      expect(stored.updatedBy).toBe(await personIdOf(testDb.db, me.email))
    })

    it('says "Payment deleted." for a payment', async () => {
      const id = await createGroup()
      const payment = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id)
      const page = renderExpense(id, payment)
      await screen.findByRole('heading', { name: 'You paid Priya' })
      await user.click(deleteButton())

      await user.click(within(await confirmDialog('Delete this payment?')).getByRole('button', { name: 'Delete' }))

      expect(await screen.findByText('Payment deleted.')).toBeInTheDocument()
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
      expect((await storedExpense(payment)).deletedAt).not.toBeNull()
    })

    it('keeps the dialog open until the deletion is done', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      let finish: (() => void) | undefined
      const real = expenseService.deleteExpense
      vi.spyOn(expenseService, 'deleteExpense').mockImplementation(
        (...args) => new Promise((resolve) => { finish = () => resolve(real(...args)) }),
      )
      const page = renderExpense(id, expenseId)
      await screen.findByRole('heading', { name: 'Beach shack dinner' })
      await user.click(deleteButton())

      await user.click(within(await confirmDialog('Delete this expense?')).getByRole('button', { name: 'Delete' }))

      // Still working: the dialog is up, its button busy, and nothing has moved on.
      await waitFor(() => expect(finish).toBeDefined())
      expect(screen.getByRole('dialog', { name: 'Delete this expense?' })).toBeInTheDocument()
      expect(within(screen.getByRole('dialog', { name: 'Delete this expense?' })).getByRole('button', { name: /Delete/ })).toHaveClass('ant-btn-loading')
      expect(page.currentPath()).toBe(ROUTES.expense(id, expenseId))

      finish?.()
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
      expect(await screen.findByText('Expense deleted.')).toBeInTheDocument()
    })

    it('says so, closes the dialog and stays on the page when deleting fails', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const page = renderExpense(id, expenseId)
      await screen.findByRole('heading', { name: 'Beach shack dinner' })
      await user.click(deleteButton())
      vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))

      await user.click(within(await confirmDialog('Delete this expense?')).getByRole('button', { name: 'Delete' }))

      expect(await screen.findByText("Couldn't delete the expense. Please try again.")).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete this expense?' })).not.toBeInTheDocument())
      expect(page.currentPath()).toBe(ROUTES.expense(id, expenseId))
      expect((await storedExpense(expenseId)).deletedAt).toBeNull()
    })

    it('says the expense is no longer available, and opens the group, when it was deleted meanwhile', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const page = renderExpense(id, expenseId)
      await screen.findByRole('heading', { name: 'Beach shack dinner' })
      await user.click(deleteButton())
      await remove('priya@gmail.com', id, expenseId)

      await user.click(within(await confirmDialog('Delete this expense?')).getByRole('button', { name: 'Delete' }))

      expect(await screen.findByText('This expense is no longer available.')).toBeInTheDocument()
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
      // The first deletion stands: still by Priya.
      expect((await storedExpense(expenseId)).updatedBy).toBe(await personIdOf(testDb.db, 'priya@gmail.com'))
    })
  })

  describe('a deleted expense', () => {
    it('opens read-only: no Edit or Delete, Back to the group, and who deleted it and when', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await remove(me.email, id, expenseId)
      const page = renderExpense(id, expenseId)

      expect(await screen.findByRole('heading', { name: 'Beach shack dinner' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Edit$/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
      expect(screen.getByText(/^Deleted by you, 21 Oct 2026, 3:45\s?PM$/)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Back' }))
      expect(page.currentPath()).toBe(ROUTES.group(id))
    })

    it('is titled "Deleted expense", or "Deleted payment" for a payment, and a live one has no such title', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const payment = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id)

      renderExpense(id, expenseId)
      await screen.findByRole('heading', { name: 'Beach shack dinner' })
      expect(screen.queryByRole('heading', { name: /^Deleted / })).not.toBeInTheDocument()
      cleanup()

      await remove(me.email, id, expenseId)
      await remove(me.email, id, payment)
      renderExpense(id, expenseId)
      const title = await screen.findByRole('heading', { name: 'Deleted expense' })
      // It sits beside Back, in the header row, above the expense's own title.
      expect(title.parentElement).toContainElement(screen.getByRole('button', { name: 'Back' }))
      expect(screen.getByRole('heading', { name: 'Beach shack dinner' })).toBeInTheDocument()
      cleanup()

      renderExpense(id, payment)
      expect(await screen.findByRole('heading', { name: 'Deleted payment' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'You paid Priya' })).toBeInTheDocument()
    })

    it('names someone else who deleted it', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await remove('priya@gmail.com', id, expenseId)
      renderExpense(id, expenseId)

      expect(await screen.findByText(/^Deleted by Priya Shah, 21 Oct 2026/)).toBeInTheDocument()
    })

    it('still shows what it was: the amount, the split, the notes', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await remove(me.email, id, expenseId)
      renderExpense(id, expenseId)

      expect(await screen.findByText('£9.00')).toBeInTheDocument()
      expect(screen.getByText('Split equally')).toBeInTheDocument()
      expect(screen.getByText('You owe £3.00')).toBeInTheDocument()
      expect(screen.getByText('Card')).toBeInTheDocument()
    })

    it('has no "Deleted by" line while it is not deleted', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      renderExpense(id, expenseId)

      await screen.findByText('Added by you')
      expect(screen.queryByText(/^Deleted by/)).not.toBeInTheDocument()
    })

    it('starts its history with "You deleted this expense", even if it was never edited', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      vi.setSystemTime(new Date(2026, 9, 21, 16, 10))
      await remove(me.email, id, expenseId)
      renderExpense(id, expenseId)

      await screen.findByText('History')
      const entries = [...screen.getByRole('list', { name: 'History' }).children].map((entry) => entry.textContent)
      expect(entries).toHaveLength(2)
      expect(entries[0]).toMatch(/^You deleted this expense · 21 Oct 2026, 4:10\s?PM$/)
      expect(entries[1]).toMatch(/^You added this expense · 21 Oct 2026, 3:45\s?PM$/)
    })

    it('puts the deletion above the edits in the history, and calls a payment a payment', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const meId = await personIdOf(testDb.db, me.email)
      const saved = await expenseService.getExpenseToEdit(testDb.db, meId, id, expenseId)
      vi.setSystemTime(new Date(2026, 9, 21, 16, 0))
      await expenseService.updateExpense(testDb.db, meId, id, expenseId, {
        description: 'Lunch',
        category: saved!.category,
        amountMinor: saved!.amountMinor,
        currency: saved!.currency,
        date: saved!.date,
        notes: saved!.notes ?? '',
        paidBy: saved!.paidBy,
        split: saved!.split,
        receipts: saved!.receipts,
      })
      vi.setSystemTime(new Date(2026, 9, 21, 17, 0))
      await remove(me.email, id, expenseId)
      const payment = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id)
      await remove(me.email, id, payment)

      renderExpense(id, expenseId)
      await screen.findByText('History')
      const headers = [...screen.getByRole('list', { name: 'History' }).children].map((entry) => entry.textContent?.split(' · ')[0])
      expect(headers).toEqual(['You deleted this expense', 'You edited this expense', 'You added this expense'])
      cleanup()

      renderExpense(id, payment)
      await screen.findByRole('heading', { name: 'You paid Priya' })
      await screen.findByText('History')
      const paymentHeaders = [...screen.getByRole('list', { name: 'History' }).children].map((entry) => entry.textContent?.split(' · ')[0])
      expect(paymentHeaders).toEqual(['You deleted this payment', 'You added this payment'])
    })
  })
})
