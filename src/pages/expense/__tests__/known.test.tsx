// @vitest-environment jsdom
// The expense page opened from the group's list: it shows what the list knew
// while the rest loads (ADR-053).
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { ExpensePage } from '../index.tsx'
import type { ExpensePageState } from '../types.ts'

vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const testDb = setUpTestDatabase()
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 8, 12, 0))
  user = userEvent.setup({ advanceTimers: () => {} })
  useAuthStore.setState({ profile: me, token: null })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.mocked(getDb).mockReset()
})

async function setUp() {
  const group = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
  if (!group.ok) throw new Error('group')
  await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
  const expenseId = await addTestExpense(testDb.db, me.email, group.groupId, {
    description: 'Beach shack dinner',
    category: 'food.dining_out',
    amountMinor: 900,
    date: '2026-10-05',
    notes: 'Paid by card',
  })
  vi.mocked(getDb).mockImplementation(async () => testDb.db)
  return { groupId: group.groupId, expenseId }
}

function opened(groupId: string, expenseId: string, overrides: Partial<ExpensePageState['expense']> = {}): ExpensePageState {
  return { expense: { id: expenseId, groupId, description: 'Beach shack dinner', category: 'food.dining_out', amountMinor: 900, currency: 'GBP', date: '2026-10-05', ...overrides } }
}

/** The expense page with its data held back until `release` is called. */
function renderHeld(groupId: string, expenseId: string, state?: unknown) {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  vi.mocked(getDb).mockImplementation(async () => {
    await held
    return testDb.db
  })
  const page = renderPage(<ExpensePage />, {
    path: ROUTES.expense(groupId, expenseId),
    pattern: ROUTES.expensePattern,
    routes: [ROUTES.groupPattern, ROUTES.editExpensePattern],
    state,
  })
  return { ...page, release }
}

describe('the expense page while it loads, opened from the group list', () => {
  it('shows the band with the category, amount, description and day at once, titled "Expense"', async () => {
    const { groupId, expenseId } = await setUp()
    const page = renderHeld(groupId, expenseId, opened(groupId, expenseId))

    expect(screen.getByRole('heading', { name: 'Expense', level: 3 })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Dining out' }).length).toBeGreaterThan(0)
    expect(screen.getByText('£9.00')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Beach shack dinner' })).toBeInTheDocument()
    // The day and the category are chips, which cannot open the edit page until the expense is read.
    const day = screen.getByRole('button', { name: /Mon, 5 Oct 2026$/ })
    const category = screen.getByRole('button', { name: /Dining out$/ })
    expect(day.compareDocumentPosition(category) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(day)
    expect(page.currentPath()).toBe(ROUTES.expense(groupId, expenseId))
  })

  it('shows a spinner for the rest, and nothing of who paid, the split, notes or history', async () => {
    const { groupId, expenseId } = await setUp()
    renderHeld(groupId, expenseId, opened(groupId, expenseId))

    expect(screen.getByRole('status', { name: 'Loading the expense' })).toHaveTextContent('Loading the expense…')
    expect(screen.queryByText(/Added by/)).not.toBeInTheDocument()
    expect(screen.queryByText(/You paid/)).not.toBeInTheDocument()
    expect(screen.queryByText('Notes')).not.toBeInTheDocument()
    expect(screen.queryByText('History')).not.toBeInTheDocument()
  })

  it('has Back working, and Edit and Delete switched off with no "Coming soon" tip', async () => {
    const { groupId, expenseId } = await setUp()
    const page = renderHeld(groupId, expenseId, opened(groupId, expenseId))

    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Restore$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' }).parentElement?.tagName).toBe('DIV')

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(groupId)))
  })

  it('sets the tab title from the known description', async () => {
    const { groupId, expenseId } = await setUp()
    renderHeld(groupId, expenseId, opened(groupId, expenseId, { description: 'Beach shack dinner' }))
    await waitFor(() => expect(document.title).toBe('Beach shack dinner · OwnLedger'))
  })

  describe('when the data arrives', () => {
    it('fills in who paid, the split, the notes and the history, and switches Edit and Delete on', async () => {
      const { groupId, expenseId } = await setUp()
      const { release } = renderHeld(groupId, expenseId, opened(groupId, expenseId))

      release()

      expect(await screen.findByText('You added this expense')).toBeInTheDocument()
      expect(screen.getByText('You paid £9.00')).toBeInTheDocument()
      expect(screen.getByText('Paid by card')).toBeInTheDocument()
      expect(screen.queryByRole('status', { name: 'Loading the expense' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
    })

    it('replaces what the list knew with the real data', async () => {
      const { groupId, expenseId } = await setUp()
      const { release } = renderHeld(groupId, expenseId, opened(groupId, expenseId, { description: 'Old name', amountMinor: 100 }))
      expect(screen.getByRole('heading', { name: 'Old name' })).toBeInTheDocument()
      expect(screen.getByText('£1.00')).toBeInTheDocument()

      release()

      expect(await screen.findByRole('heading', { name: 'Beach shack dinner' })).toBeInTheDocument()
      expect(screen.getByText('£9.00')).toBeInTheDocument()
      expect(screen.queryByText('Old name')).not.toBeInTheDocument()
    })

    it('shows "Expense not found" if the expense is gone', async () => {
      const { groupId } = await setUp()
      const gone = '3f2a9c1e-0000-4000-8000-000000000009'
      const { release } = renderHeld(groupId, gone, opened(groupId, gone))
      release()
      expect(await screen.findByText('Expense not found')).toBeInTheDocument()
    })
  })
})

const priyaPerson = { email: 'priya@gmail.com', name: 'Priya Shah', isYou: false }
const youPerson = { email: 'omkar@gmail.com', name: 'Omkar Sheral', isYou: true }

describe('a payment while it loads, opened from the group list', () => {
  it('shows the band titled "Payment", worded by who paid whom, with Edit and Delete switched off', async () => {
    const { groupId, expenseId } = await setUp()
    renderHeld(groupId, expenseId, opened(groupId, expenseId, { category: 'settlement', description: 'Payment', payer: youPerson, recipient: priyaPerson }))

    expect(screen.getByRole('heading', { name: 'Payment', level: 3 })).toBeInTheDocument()
    // Who paid whom is a row below the band at once: avatars (initials until the data arrives) and first names.
    const row = screen.getByRole('group', { name: 'You paid Priya' })
    expect(row.textContent).toBe('YYoupaidPPriya')
    expect(screen.queryByRole('heading', { name: 'You paid Priya' })).not.toBeInTheDocument()
    expect(screen.getByText('£9.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(screen.getByRole('status', { name: 'Loading the expense' })).toBeInTheDocument()
  })

  it('names the payer when someone else paid you', async () => {
    const { groupId, expenseId } = await setUp()
    renderHeld(groupId, expenseId, opened(groupId, expenseId, { category: 'settlement', description: 'Payment', payer: priyaPerson, recipient: youPerson }))
    expect(screen.getByRole('group', { name: 'Priya paid you' })).toBeInTheDocument()
  })
})

describe('a deleted expense while it loads, opened from the group list', () => {
  const deleted = { by: priyaPerson, at: new Date(2026, 9, 6, 15, 45) }

  it('shows the band titled "Deleted expense" and Restore switched off, with no line about who deleted it', async () => {
    const { groupId, expenseId } = await setUp()
    renderHeld(groupId, expenseId, opened(groupId, expenseId, { deleted }))

    expect(screen.getByRole('heading', { name: 'Deleted expense', level: 3 })).toBeInTheDocument()
    // The band says nothing of who deleted it: the history does, once it is read.
    expect(screen.queryByText(/^Deleted by/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Restore$/ })).toBeDisabled()
    // Switched off for loading, not "Coming soon": no tip wrapper.
    expect(screen.getByRole('button', { name: /Restore$/ }).parentElement?.tagName).toBe('DIV')
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('is titled "Deleted payment" for a payment, and shows who paid whom', async () => {
    const { groupId, expenseId } = await setUp()
    renderHeld(
      groupId,
      expenseId,
      opened(groupId, expenseId, { category: 'settlement', description: 'Payment', payer: youPerson, recipient: priyaPerson, deleted: { by: youPerson, at: deleted.at } }),
    )
    expect(screen.getByRole('heading', { name: 'Deleted payment', level: 3 })).toBeInTheDocument()
    expect(screen.queryByText(/^Deleted by/)).not.toBeInTheDocument()
  })
})

describe('the expense page while it loads, opened any other way', () => {
  it.each([
    ['with no state (a direct link)', undefined],
    ['with the state of another expense', 'other'],
    ['with a payment that does not say who paid whom', 'payment'],
    ['with a state that is not an expense', { something: 1 }],
  ])('shows only the loader %s', async (_name, kind) => {
    const { groupId, expenseId } = await setUp()
    const other = '3f2a9c1e-0000-4000-8000-000000000009'
    const state =
      kind === 'other' ? opened(groupId, other) : kind === 'payment' ? opened(groupId, expenseId, { category: 'settlement' }) : kind
    renderHeld(groupId, expenseId, state)

    expect(screen.getByRole('status', { name: 'Loading the expense' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Expense', level: 3 })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })
})
