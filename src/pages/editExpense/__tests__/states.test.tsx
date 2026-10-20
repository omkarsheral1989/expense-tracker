// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { expenses, groupMembers, people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { expectCenteredMessage } from '../../../testing/centered.ts'
import { addTestSettlement } from '../../../testing/expenses.ts'
import { me, setUpEditExpenseTests } from './helpers.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const { testDb, createGroup, addExpense, renderEdit } = setUpEditExpenseTests()

describe('EditExpensePage: states', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 20, 12, 0))
    useAuthStore.setState({ profile: me, token: null })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.mocked(getDb).mockClear()
  })

  it('shows grey placeholders while the expense loads', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id)
    vi.mocked(getDb).mockImplementationOnce(() => new Promise(() => {}))
    renderEdit(id, expenseId)

    expect(screen.getByRole('status', { name: 'Loading the expense' })).toBeInTheDocument()
  })

  it('says so when the expense cannot be loaded, and loads it on "Try again"', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id)
    vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))
    renderEdit(id, expenseId)

    expect(await screen.findByText("Couldn't load this expense")).toBeInTheDocument()
    expectCenteredMessage(screen.getByText("Couldn't load this expense"))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Edit expense' })).toBeInTheDocument()
  })

  describe('"Expense not found", with a way back to the group, for an expense', () => {
    async function expectNotFound(groupId: string, page: ReturnType<typeof renderEdit>) {
      expect(await screen.findByText('Expense not found')).toBeInTheDocument()
      expect(screen.getByText('It may have been deleted, or you may not be a member of its group.')).toBeInTheDocument()
      expectCenteredMessage(screen.getByText('Expense not found'))
      await waitFor(() => expect(document.title).toBe('Expense not found · OwnLedger'))
      expect(screen.queryByRole('heading', { name: 'Edit expense' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Back to the group' }))
      expect(page.currentPath()).toBe(ROUTES.group(groupId))
    }

    it('that does not exist', async () => {
      const id = await createGroup()
      await expectNotFound(id, renderEdit(id, crypto.randomUUID()))
    })

    it('that was deleted', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await testDb.db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, expenseId))
      await expectNotFound(id, renderEdit(id, expenseId))
    })

    it('that is in another group', async () => {
      const id = await createGroup()
      const other = await createGroup({ name: 'Flat bills' })
      const expenseId = await addExpense(other)
      await expectNotFound(id, renderEdit(id, expenseId))
    })

    it('in a group the user is not in', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const meId = (await testDb.db.select().from(people).where(eq(people.email, me.email)))[0].id
      await testDb.db
        .update(groupMembers)
        .set({ deletedAt: new Date() })
        .where(and(eq(groupMembers.groupId, id), eq(groupMembers.personId, meId)))

      await expectNotFound(id, renderEdit(id, expenseId))
    })

    it('that is a payment between members, which has no edit form yet', async () => {
      const id = await createGroup()
      const payment = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id)
      await expectNotFound(id, renderEdit(id, payment))
    })
  })
})
