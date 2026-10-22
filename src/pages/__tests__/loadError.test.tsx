// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../db/client.ts'
import { ROUTES } from '../../routes.ts'
import { useAuthStore } from '../../stores/useAuthStore'
import { renderPage } from '../../testing/render.tsx'
import { AddExpensePage } from '../addExpense/index.tsx'
import { EditExpensePage } from '../editExpense/index.tsx'
import { EditGroupPage } from '../editGroup/index.tsx'
import { ExpensePage } from '../expense/index.tsx'
import { ExpenseVersionPage } from '../expenseVersion/index.tsx'
import { GroupPage } from '../group/index.tsx'
import { SettleUpPage } from '../settleUp/index.tsx'

// The pages cannot reach their data: opening the database fails, as it did when it was not open.
vi.mock('../../db/client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../db/client.ts')>()),
  getDb: vi.fn(async () => {
    throw new Error('The database is not open. Sign in first.')
  }),
}))
// The group page's Sync button needs no Google provider when there is no client id.
vi.mock('../../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: true }))

const GROUP = '3f2a9c1e-0000-4000-8000-000000000001'
const EXPENSE = '3f2a9c1e-0000-4000-8000-000000000002'
const EVENT = '3f2a9c1e-0000-4000-8000-000000000003'

type Case = {
  name: string
  title: string
  page: ReactElement
  path: string
  pattern: string
  /** Where Back must lead. */
  backTo: string
}

const CASES: Case[] = [
  { name: 'the group page', title: "Couldn't load this group", page: <GroupPage />, path: ROUTES.group(GROUP), pattern: ROUTES.groupPattern, backTo: ROUTES.home },
  { name: 'edit group', title: "Couldn't load this group", page: <EditGroupPage />, path: ROUTES.editGroup(GROUP), pattern: ROUTES.editGroupPattern, backTo: ROUTES.group(GROUP) },
  { name: 'settle up', title: "Couldn't load this group", page: <SettleUpPage />, path: ROUTES.settleUp(GROUP), pattern: ROUTES.settleUpPattern, backTo: ROUTES.group(GROUP) },
  { name: 'add expense', title: "Couldn't load this group", page: <AddExpensePage />, path: ROUTES.newExpense(GROUP), pattern: ROUTES.newExpensePattern, backTo: ROUTES.group(GROUP) },
  { name: 'the expense page', title: "Couldn't load this expense", page: <ExpensePage />, path: ROUTES.expense(GROUP, EXPENSE), pattern: ROUTES.expensePattern, backTo: ROUTES.group(GROUP) },
  { name: 'edit expense', title: "Couldn't load this expense", page: <EditExpensePage />, path: ROUTES.editExpense(GROUP, EXPENSE), pattern: ROUTES.editExpensePattern, backTo: ROUTES.expense(GROUP, EXPENSE) },
  { name: 'a version of an expense', title: "Couldn't load this version", page: <ExpenseVersionPage />, path: ROUTES.expenseVersion(GROUP, EXPENSE, EVENT), pattern: ROUTES.expenseVersionPattern, backTo: ROUTES.expense(GROUP, EXPENSE) },
]

beforeEach(() => useAuthStore.setState({ profile: { id: '1', email: 'omkar@gmail.com', name: 'Omkar' }, guest: false, token: null }))
afterEach(() => {
  cleanup()
  vi.mocked(getDb).mockClear()
})

describe.each(CASES)('when $name cannot load its data', ({ page, path, pattern, title, backTo }) => {
  function renderIt() {
    return renderPage(page, {
      path,
      pattern,
      routes: [ROUTES.home, ROUTES.groupPattern, ROUTES.expensePattern],
    })
  }

  it('says so, with what went wrong, and offers Try again', async () => {
    renderIt()

    expect(await screen.findByText(title)).toBeInTheDocument()
    expect(screen.getByText('The database is not open. Sign in first.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('tries again when asked', async () => {
    renderIt()
    await screen.findByText(title)
    const before = vi.mocked(getDb).mock.calls.length

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await vi.waitFor(() => expect(vi.mocked(getDb).mock.calls.length).toBeGreaterThan(before))
  })

  it('has a Back arrow at the top left that leads out, so a page that keeps failing is no dead end', async () => {
    const view = renderIt()
    await screen.findByText(title)

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(view.currentPath()).toBe(backTo)
  })
})

