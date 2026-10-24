// @vitest-environment jsdom
// Edit expense and Edit group open with no loader: their data is read while the
// page before them is on screen (ADR-055).
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../db/client.ts'
import { ROUTES } from '../../routes.ts'
import { expenseService } from '../../services/expenseService'
import { useAuthStore } from '../../stores/useAuthStore'
import { setUpTestDatabase } from '../../testing/database.ts'
import { addTestExpense, addTestSettlement } from '../../testing/expenses.ts'
import { createTestGroup, ensurePersonId } from '../../testing/groups.ts'
import { renderPage } from '../../testing/render.tsx'
import { EditExpensePage } from '../editExpense/index.tsx'
import { EditGroupPage } from '../editGroup/index.tsx'
import { ExpensePage } from '../expense/index.tsx'
import { GroupPage } from '../group/index.tsx'

vi.mock('../../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: false }))
vi.mock('../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const testDb = setUpTestDatabase()

beforeEach(async () => {
  useAuthStore.setState({ profile: me, guest: false, token: null })
  await ensurePersonId(testDb.db, me.email, me.name)
})
afterEach(() => {
  cleanup()
  vi.mocked(getDb).mockReset()
})

async function setUp() {
  const created = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
  if (!created.ok) throw new Error('group')
  const expense = await addTestExpense(testDb.db, me.email, created.groupId, { description: 'Dinner', amountMinor: 900 })
  vi.mocked(getDb).mockImplementation(async () => testDb.db)
  return { group: created.groupId, expense }
}

/** From now on every read of the database waits for ever: only what was read already can show. */
function stopReadingTheDatabase() {
  vi.mocked(getDb).mockImplementation(() => new Promise(() => {}))
}

describe('Edit expense, opened from the expense page', () => {
  function renderExpense(group: string, expense: string) {
    return renderPage(<ExpensePage />, {
      path: ROUTES.expense(group, expense),
      pattern: ROUTES.expensePattern,
      routes: [ROUTES.groupPattern],
      extra: [{ path: ROUTES.editExpensePattern, element: <EditExpensePage /> }],
    })
  }

  it('shows the form at once, filled in, with no loader', async () => {
    const { group, expense } = await setUp()
    const page = renderExpense(group, expense)
    await screen.findByText('You added this expense')
    // The form's data is read behind the page; give that a moment.
    await new Promise((resolve) => setTimeout(resolve, 300))
    stopReadingTheDatabase()

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.editExpense(group, expense)))
    expect(screen.queryByRole('status', { name: 'Loading the expense' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue('Dinner')
  })

  it('reads the data when the expense is not on screen first (a direct link), showing the loader', async () => {
    const { group, expense } = await setUp()
    stopReadingTheDatabase()
    renderPage(<EditExpensePage />, { path: ROUTES.editExpense(group, expense), pattern: ROUTES.editExpensePattern, routes: [ROUTES.expensePattern] })
    expect(screen.getByRole('status', { name: 'Loading the expense' })).toBeInTheDocument()
  })

  it('does not read it for a payment, which cannot be edited', async () => {
    const { group } = await setUp()
    await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', group)
    const expenses = await testDb.db.query.expenses.findMany()
    const payment = expenses.find((row) => row.category === expenseService.settlementCategory)!
    const toEdit = vi.spyOn(expenseService, 'getExpenseToEdit')

    renderExpense(group, payment.id)
    await screen.findByText('You added this payment')
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(toEdit).not.toHaveBeenCalled()
    toEdit.mockRestore()
  })
})

describe('Edit group, opened from the group page', () => {
  it('shows the form at once, filled in, with no loader', async () => {
    const { group } = await setUp()
    const page = renderPage(<GroupPage />, {
      path: ROUTES.group(group),
      pattern: ROUTES.groupPattern,
      routes: [ROUTES.home],
      extra: [{ path: ROUTES.editGroupPattern, element: <EditGroupPage /> }],
    })
    await screen.findByText('Dinner')
    await new Promise((resolve) => setTimeout(resolve, 300))
    stopReadingTheDatabase()

    await userEvent.click(screen.getByRole('button', { name: 'Edit group' }))

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.editGroup(group)))
    expect(screen.queryByRole('status', { name: 'Loading the group' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Group name' })).toHaveValue('Goa trip')
  })

  it('shows the loader when opened by its address', async () => {
    const { group } = await setUp()
    stopReadingTheDatabase()
    renderPage(<EditGroupPage />, { path: ROUTES.editGroup(group), pattern: ROUTES.editGroupPattern, routes: [ROUTES.groupPattern] })
    expect(screen.getByRole('status', { name: 'Loading the group' })).toBeInTheDocument()
  })
})
