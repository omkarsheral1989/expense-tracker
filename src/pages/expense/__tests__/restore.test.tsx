// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { expenses, groupMembers, people } from '../../../db/schema.ts'
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

async function bringBack(email: string, groupId: string, expenseId: string) {
  const result = await expenseService.restoreExpense(testDb.db, await personIdOf(testDb.db, email), groupId, expenseId)
  if (!result.ok) throw new Error('Not restored.')
}

const restoreButton = () => screen.getByRole('button', { name: /Restore$/ })
async function storedExpense(expenseId: string) {
  const [row] = await testDb.db.select().from(expenses).where(eq(expenses.id, expenseId))
  return row
}
/** Each entry of the history as text, newest first. */
const historyEntries = () => [...screen.getByRole('list', { name: 'History' }).children].map((entry) => entry.textContent ?? '')

describe('ExpensePage: restoring', () => {
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

  describe('the Restore button', () => {
    it('is on a deleted expense, in place of Edit and Delete', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await remove(me.email, id, expenseId)
      renderExpense(id, expenseId)

      await screen.findByRole('heading', { name: 'Deleted expense' })
      expect(restoreButton()).toBeEnabled()
      expect(screen.queryByRole('button', { name: /Edit$/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    })

    it('is on a deleted payment, and not on a live expense or payment', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const payment = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id)

      renderExpense(id, expenseId)
      await screen.findByRole('heading', { name: 'Beach shack dinner' })
      expect(screen.queryByRole('button', { name: /Restore$/ })).not.toBeInTheDocument()
      cleanup()

      renderExpense(id, payment)
      await screen.findByRole('heading', { name: 'You paid Priya' })
      expect(screen.queryByRole('button', { name: /Restore$/ })).not.toBeInTheDocument()
      cleanup()

      await remove(me.email, id, payment)
      renderExpense(id, payment)
      expect(await screen.findByRole('heading', { name: 'Deleted payment' })).toBeInTheDocument()
      expect(restoreButton()).toBeInTheDocument()
    })
  })

  describe('restoring', () => {
    it('brings the expense back at once, with no question, and says "Expense restored."', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await remove(me.email, id, expenseId)
      vi.setSystemTime(new Date(2026, 9, 21, 16, 30))
      renderExpense(id, expenseId)
      await screen.findByRole('heading', { name: 'Deleted expense' })

      await user.click(restoreButton())

      expect(await screen.findByText('Expense restored.')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      const stored = await storedExpense(expenseId)
      expect(stored.deletedAt).toBeNull()
      expect(stored.updatedBy).toBe(await personIdOf(testDb.db, me.email))
    })

    it('leaves the user on the page, which now shows a live expense with Edit and Delete', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await remove(me.email, id, expenseId)
      const page = renderExpense(id, expenseId)
      await screen.findByRole('heading', { name: 'Deleted expense' })

      await user.click(restoreButton())

      expect(await screen.findByRole('button', { name: /Edit$/ })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Restore$/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Deleted expense' })).not.toBeInTheDocument()
      expect(screen.queryByText(/^Deleted by/)).not.toBeInTheDocument()
      // It is the expense as it was.
      expect(screen.getByRole('heading', { name: 'Beach shack dinner' })).toBeInTheDocument()
      expect(screen.getByText('£9.00')).toBeInTheDocument()
      expect(screen.getByText('You owe £3.00')).toBeInTheDocument()
      expect(screen.getByText('Card')).toBeInTheDocument()
      expect(page.currentPath()).toBe(ROUTES.expense(id, expenseId))
    })

    it('adds "You restored this expense" at the top of the history, above the deletion and the adding', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      vi.setSystemTime(new Date(2026, 9, 21, 16, 0))
      await remove(me.email, id, expenseId)
      vi.setSystemTime(new Date(2026, 9, 21, 17, 15))
      renderExpense(id, expenseId)
      await screen.findByRole('heading', { name: 'Deleted expense' })
      expect(historyEntries()).toHaveLength(2)

      await user.click(restoreButton())

      await screen.findByText('Expense restored.')
      await waitFor(() => expect(historyEntries()).toHaveLength(3))
      const [restored, deleted, added] = historyEntries()
      expect(restored).toMatch(/^You restored this expense · 21 Oct 2026, 5:15\s?PM$/)
      expect(deleted).toMatch(/^You deleted this expense · 21 Oct 2026, 4:00\s?PM$/)
      expect(added).toMatch(/^You added this expense · 21 Oct 2026, 3:45\s?PM$/)
    })

    it('says "Payment restored." for a payment', async () => {
      const id = await createGroup()
      const payment = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id)
      await remove(me.email, id, payment)
      renderExpense(id, payment)
      await screen.findByRole('heading', { name: 'Deleted payment' })

      await user.click(restoreButton())

      expect(await screen.findByText('Payment restored.')).toBeInTheDocument()
      expect(await screen.findByRole('heading', { name: 'You paid Priya' })).toBeInTheDocument()
      expect((await storedExpense(payment)).deletedAt).toBeNull()
      await waitFor(() => expect(historyEntries()[0]).toMatch(/^You restored this payment/))
    })

    it('shows the button busy while it works, and changes nothing until it is done', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await remove(me.email, id, expenseId)
      let finish: (() => void) | undefined
      const real = expenseService.restoreExpense
      vi.spyOn(expenseService, 'restoreExpense').mockImplementation(
        (...args) => new Promise((resolve) => { finish = () => resolve(real(...args)) }),
      )
      renderExpense(id, expenseId)
      await screen.findByRole('heading', { name: 'Deleted expense' })

      await user.click(restoreButton())

      await waitFor(() => expect(finish).toBeDefined())
      expect(restoreButton()).toHaveClass('ant-btn-loading')
      expect(screen.getByRole('heading', { name: 'Deleted expense' })).toBeInTheDocument()
      expect((await storedExpense(expenseId)).deletedAt).not.toBeNull()

      finish?.()
      expect(await screen.findByText('Expense restored.')).toBeInTheDocument()
      expect(await screen.findByRole('button', { name: /Edit$/ })).toBeInTheDocument()
    })

    it('says so and stays deleted, with the button still there, when restoring fails', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await remove(me.email, id, expenseId)
      const page = renderExpense(id, expenseId)
      await screen.findByRole('heading', { name: 'Deleted expense' })
      vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))

      await user.click(restoreButton())

      expect(await screen.findByText("Couldn't restore the expense. Please try again.")).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Deleted expense' })).toBeInTheDocument()
      expect(restoreButton()).not.toHaveClass('ant-btn-loading')
      expect(page.currentPath()).toBe(ROUTES.expense(id, expenseId))
      expect((await storedExpense(expenseId)).deletedAt).not.toBeNull()
    })

    it('says it was already restored, and shows it as it is now, when someone else restored it meanwhile', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await remove(me.email, id, expenseId)
      renderExpense(id, expenseId)
      await screen.findByRole('heading', { name: 'Deleted expense' })
      await bringBack('priya@gmail.com', id, expenseId)

      await user.click(restoreButton())

      expect(await screen.findByText('This expense was already restored.')).toBeInTheDocument()
      expect(await screen.findByRole('button', { name: /Edit$/ })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Deleted expense' })).not.toBeInTheDocument()
      // Priya's restoration stands: the only one.
      expect((await storedExpense(expenseId)).updatedBy).toBe(await personIdOf(testDb.db, 'priya@gmail.com'))
      expect(historyEntries().filter((entry) => entry.startsWith('Priya Shah restored')).length).toBe(1)
    })

    it('says it is no longer available, and opens the group, when the user left the group meanwhile', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await remove(me.email, id, expenseId)
      const page = renderExpense(id, expenseId)
      await screen.findByRole('heading', { name: 'Deleted expense' })
      await testDb.db
        .update(groupMembers)
        .set({ deletedAt: new Date() })
        .where(and(eq(groupMembers.groupId, id), eq(groupMembers.personId, await personIdOf(testDb.db, me.email))))

      await user.click(restoreButton())

      expect(await screen.findByText('This expense is no longer available.')).toBeInTheDocument()
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
      expect((await storedExpense(expenseId)).deletedAt).not.toBeNull()
    })
  })

  describe('the history', () => {
    it('keeps every deletion and restoration, in order, with who did each', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      for (const [email, hour] of [[me.email, 16], ['priya@gmail.com', 18]] as const) {
        vi.setSystemTime(new Date(2026, 9, 21, hour, 0))
        await remove(email, id, expenseId)
        vi.setSystemTime(new Date(2026, 9, 21, hour + 1, 0))
        await bringBack(me.email, id, expenseId)
      }
      renderExpense(id, expenseId)

      await screen.findByText('History')
      expect(historyEntries().map((entry) => entry.split(' · ')[0])).toEqual([
        'You restored this expense',
        'Priya Shah deleted this expense',
        'You restored this expense',
        'You deleted this expense',
        'You added this expense',
      ])
    })

    it('shows up for an expense that was deleted and restored without ever being edited, and for none that was only added', async () => {
      const id = await createGroup()
      const untouched = await addExpense(id)
      const restored = await addExpense(id, { description: 'Taxi' })
      await remove(me.email, id, restored)
      await bringBack(me.email, id, restored)

      renderExpense(id, untouched)
      await screen.findByRole('heading', { name: 'Beach shack dinner' })
      expect(screen.queryByText('History')).not.toBeInTheDocument()
      cleanup()

      renderExpense(id, restored)
      expect(await screen.findByText('History')).toBeInTheDocument()
      expect(historyEntries()).toHaveLength(3)
    })

    it('puts edits between the adding and the deletion, each with what it changed', async () => {
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
      vi.setSystemTime(new Date(2026, 9, 21, 18, 0))
      await bringBack(me.email, id, expenseId)
      renderExpense(id, expenseId)

      await screen.findByText('History')
      const [, , edited] = [...screen.getByRole('list', { name: 'History' }).children] as HTMLElement[]
      expect(edited.textContent).toMatch(/^You edited this expense/)
      expect(within(edited).getAllByRole('listitem').map((line) => line.textContent)).toEqual([
        "Description changed from 'Beach shack dinner' to 'Lunch'",
      ])
      expect(historyEntries().map((entry) => entry.split(' · ')[0])).toEqual([
        'You restored this expense',
        'You deleted this expense',
        'You edited this expense',
        'You added this expense',
      ])
    })
  })
})
