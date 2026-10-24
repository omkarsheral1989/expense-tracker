// @vitest-environment jsdom
// The group's expenses are read and drawn 30 at a time, and the next batch when the end of the list nears (ADR-058).
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '../../../routes.ts'
import { expenseService } from '../../../services/expenseService'
import { EXPENSE_PAGE_SIZE } from '../../../services/expenseService/constants.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { useSyncStore } from '../../../stores/useSyncStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { stubIntersectionObserver } from '../../../testing/intersectionObserver.ts'
import { renderPage } from '../../../testing/render.tsx'
import { GroupPage } from '../index.tsx'

vi.mock('../../../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: true }))
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const testDb = setUpTestDatabase()

let observers: ReturnType<typeof stubIntersectionObserver>
beforeEach(() => {
  useAuthStore.setState({ profile: me, guest: false, token: null })
  observers = stubIntersectionObserver()
})
afterEach(() => {
  cleanup()
  observers.restore()
  vi.restoreAllMocks()
  useSyncStore.setState({ dataVersion: 0 })
})

/** A group of two with `count` expenses: "Expense 1" is the oldest, and each is a day later, 31 days to a month. */
async function setUp(count: number) {
  const created = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
  if (!created.ok) throw new Error('group')
  for (let i = 1; i <= count; i++) {
    const day = ((i - 1) % 28) + 1
    const month = 8 + Math.floor((i - 1) / 28)
    await addTestExpense(testDb.db, me.email, created.groupId, {
      description: `Expense ${i}`,
      amountMinor: 1000,
      date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    })
  }
  return created.groupId
}

function renderGroup(groupId: string) {
  return renderPage(<GroupPage />, { path: ROUTES.group(groupId), pattern: ROUTES.groupPattern, routes: [ROUTES.home, ROUTES.expensePattern] })
}

const rows = () => within(screen.getByRole('region', { name: 'Expenses' })).getAllByRole('listitem')
const titles = () => rows().map((row) => row.querySelector('a')?.textContent)

/** Tells the list that its end is in view, and waits for the batch that follows. */
async function scrollToEnd(expectedRows: number) {
  await act(async () => observers.reach())
  await waitFor(() => expect(rows()).toHaveLength(expectedRows))
}

describe('the group page with many expenses', () => {
  it('draws only the first 30, newest first, and watches the end of the list', async () => {
    const groupId = await setUp(70)
    renderGroup(groupId)

    await screen.findByRole('region', { name: 'Expenses' })
    expect(rows()).toHaveLength(EXPENSE_PAGE_SIZE)
    expect(screen.getByText('Expense 70')).toBeInTheDocument()
    expect(screen.queryByText('Expense 40')).not.toBeInTheDocument()
    expect(observers.active()).toHaveLength(1)
    // Asked for a screen before the end, not only once it is reached.
    expect(observers.active()[0].options?.rootMargin).toBe('600px')
  })

  it('adds the next 30 when the end is reached, then the last 10, and then stops watching', async () => {
    const groupId = await setUp(70)
    renderGroup(groupId)
    await screen.findByRole('region', { name: 'Expenses' })

    await scrollToEnd(60)
    expect(screen.getByText('Expense 40')).toBeInTheDocument()
    expect(screen.queryByText('Expense 10')).not.toBeInTheDocument()

    await scrollToEnd(70)
    expect(screen.getByText('Expense 1')).toBeInTheDocument()
    await waitFor(() => expect(observers.active()).toHaveLength(0))
    expect(screen.queryByLabelText('Loading more expenses')).not.toBeInTheDocument()
  })

  it('lists each expense once, in order, across the batches', async () => {
    const groupId = await setUp(65)
    renderGroup(groupId)
    await screen.findByRole('region', { name: 'Expenses' })
    await scrollToEnd(60)
    await scrollToEnd(65)

    const shown = titles().map((text) => text?.match(/Expense (\d+)/)?.[1])
    expect(shown).toEqual(Array.from({ length: 65 }, (_, i) => String(65 - i)))
  })

  it('shows the month header once, even when the month comes in two batches', async () => {
    // 28 expenses to a month: batch one ends in the middle of an older month.
    const groupId = await setUp(70)
    renderGroup(groupId)
    await screen.findByRole('region', { name: 'Expenses' })
    await scrollToEnd(60)
    await scrollToEnd(70)

    const headers = within(screen.getByRole('region', { name: 'Expenses' })).getAllByRole('heading', { level: 2 }).map((header) => header.textContent)
    expect(headers).toEqual(['October 2026', 'September 2026', 'August 2026'])
  })

  it('works out the balance from all expenses, not only the ones drawn', async () => {
    const groupId = await setUp(70)
    renderGroup(groupId)

    // 70 expenses of £10.00 split between two: Priya owes £5.00 each.
    expect(await screen.findByText('£350.00')).toBeInTheDocument()
    expect(rows()).toHaveLength(EXPENSE_PAGE_SIZE)
  })

  it('shows a small spinner under the list while the next batch is read, and not before', async () => {
    const groupId = await setUp(40)
    renderGroup(groupId)
    await screen.findByRole('region', { name: 'Expenses' })
    expect(screen.queryByLabelText('Loading more expenses')).not.toBeInTheDocument()
    // Present but quiet while the end is far: the watched row is empty.
    const original = expenseService.listExpensesPage
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    vi.spyOn(expenseService, 'listExpensesPage').mockImplementation(async (...args) => {
      await held
      return original(...args)
    })

    await act(async () => observers.reach())
    expect(await screen.findByLabelText('Loading more expenses')).toBeInTheDocument()
    await act(async () => release())
    await waitFor(() => expect(rows()).toHaveLength(40))
    expect(screen.queryByLabelText('Loading more expenses')).not.toBeInTheDocument()
  })

  it('does not start a second read while one is running', async () => {
    const groupId = await setUp(70)
    renderGroup(groupId)
    await screen.findByRole('region', { name: 'Expenses' })
    const original = expenseService.listExpensesPage
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    const spy = vi.spyOn(expenseService, 'listExpensesPage').mockImplementation(async (...args) => {
      await held
      return original(...args)
    })

    await act(async () => observers.reach())
    await act(async () => observers.reach())
    expect(spy).toHaveBeenCalledTimes(1)
    await act(async () => release())
    await waitFor(() => expect(rows()).toHaveLength(60))
  })

  it('ends the list with "Couldn\'t load more." and Try again when a batch fails, keeping the rows', async () => {
    const groupId = await setUp(70)
    renderGroup(groupId)
    await screen.findByRole('region', { name: 'Expenses' })
    vi.spyOn(expenseService, 'listExpensesPage').mockRejectedValueOnce(new Error('database is closed'))

    await act(async () => observers.reach())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load more.")
    expect(rows()).toHaveLength(EXPENSE_PAGE_SIZE)
    // No watching while it is failed: scrolling does not retry by itself.
    expect(observers.active()).toHaveLength(0)

    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(rows()).toHaveLength(60))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the list as long as it was when the page reads again (after a sync, or a member added)', async () => {
    const groupId = await setUp(70)
    renderGroup(groupId)
    await screen.findByRole('region', { name: 'Expenses' })
    await scrollToEnd(60)
    const spy = vi.spyOn(expenseService, 'listExpensesPage')

    act(() => useSyncStore.setState({ dataVersion: useSyncStore.getState().dataVersion + 1 }))

    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.anything(), expect.anything(), groupId, { limit: 60 }))
    await waitFor(() => expect(rows()).toHaveLength(60))
    expect(new Set(titles()).size).toBe(60)
  })

  it('reads at least the first batch size when the page reads again before more was shown', async () => {
    const groupId = await setUp(40)
    renderGroup(groupId)
    await screen.findByRole('region', { name: 'Expenses' })
    const spy = vi.spyOn(expenseService, 'listExpensesPage')

    act(() => useSyncStore.setState({ dataVersion: useSyncStore.getState().dataVersion + 1 }))

    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.anything(), expect.anything(), groupId, { limit: EXPENSE_PAGE_SIZE }))
  })

  it('has nothing to watch for a group with 30 expenses or fewer', async () => {
    const groupId = await setUp(30)
    renderGroup(groupId)
    await screen.findByRole('region', { name: 'Expenses' })

    expect(rows()).toHaveLength(30)
    expect(observers.active()).toHaveLength(0)
  })

  it('is the same empty message as before for a group without expenses', async () => {
    const created = await createTestGroup(testDb.db, me, { name: 'Empty', type: 'trip', defaultCurrency: 'GBP', memberEmails: [] })
    if (!created.ok) throw new Error('group')
    renderGroup(created.groupId)

    expect(await screen.findByText('No expenses yet')).toBeInTheDocument()
    expect(observers.active()).toHaveLength(0)
  })
})

