// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '../../routes.ts'
import { useAuthStore } from '../../stores/useAuthStore'
import { renderPage } from '../../testing/render.tsx'
import { AddExpensePage } from '../addExpense/index.tsx'
import { EditExpensePage } from '../editExpense/index.tsx'
import { EditGroupPage } from '../editGroup/index.tsx'
import { ExpensePage } from '../expense/index.tsx'
import { ExpenseVersionPage } from '../expenseVersion/index.tsx'
import { GroupPage } from '../group/index.tsx'
import { HomePage } from '../home/index.tsx'
import { MembersPage } from '../members/index.tsx'
import { SettleUpPage } from '../settleUp/index.tsx'

// The data never arrives, so every page stays in its loading state.
vi.mock('../../db/client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../db/client.ts')>()),
  getDb: vi.fn(() => new Promise(() => {})),
}))
vi.mock('../../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: false }))

const GROUP = '3f2a9c1e-0000-4000-8000-000000000001'
const EXPENSE = '3f2a9c1e-0000-4000-8000-000000000002'
const EVENT = '3f2a9c1e-0000-4000-8000-000000000003'

const CASES: { name: string; label: string; page: ReactElement; path: string; pattern?: string }[] = [
  { name: 'the home page', label: 'Loading your groups', page: <HomePage />, path: ROUTES.home },
  { name: 'the members page', label: 'Loading your members', page: <MembersPage />, path: ROUTES.members },
  { name: 'the group page', label: 'Loading the group', page: <GroupPage />, path: ROUTES.group(GROUP), pattern: ROUTES.groupPattern },
  { name: 'edit group', label: 'Loading the group', page: <EditGroupPage />, path: ROUTES.editGroup(GROUP), pattern: ROUTES.editGroupPattern },
  { name: 'add expense', label: 'Loading the group', page: <AddExpensePage />, path: ROUTES.newExpense(GROUP), pattern: ROUTES.newExpensePattern },
  { name: 'settle up', label: 'Loading the group', page: <SettleUpPage />, path: ROUTES.settleUp(GROUP), pattern: ROUTES.settleUpPattern },
  { name: 'the expense page', label: 'Loading the expense', page: <ExpensePage />, path: ROUTES.expense(GROUP, EXPENSE), pattern: ROUTES.expensePattern },
  { name: 'edit expense', label: 'Loading the expense', page: <EditExpensePage />, path: ROUTES.editExpense(GROUP, EXPENSE), pattern: ROUTES.editExpensePattern },
  { name: 'a version of an expense', label: 'Loading the version', page: <ExpenseVersionPage />, path: ROUTES.expenseVersion(GROUP, EXPENSE, EVENT), pattern: ROUTES.expenseVersionPattern },
]

beforeEach(() => useAuthStore.setState({ profile: { id: '1', email: 'omkar@gmail.com', name: 'Omkar' }, guest: false, token: null }))
afterEach(cleanup)

describe.each(CASES)('$name while it loads', ({ label, page, path, pattern }) => {
  it('shows one centered spinner with its label, and no grey skeleton', () => {
    renderPage(page, { path, pattern, routes: [ROUTES.home] })

    const status = screen.getByRole('status', { name: label })
    expect(status.querySelector('.ant-spin')).not.toBeNull()
    expect(status).toHaveTextContent(`${label}…`)
    expect(document.querySelector('.ant-skeleton')).toBeNull()
    // Centered like the other message screens.
    expect(status.parentElement).toHaveStyle({ flex: '1' })
    expect(status.parentElement).toHaveClass('ant-flex-align-center', 'ant-flex-justify-center')
  })
})

describe('the home page while it loads', () => {
  it('keeps the heading and the Create group button, and the spinner stops above the button', () => {
    renderPage(<HomePage />, { path: ROUTES.home, routes: [ROUTES.newGroup] })

    expect(screen.getByRole('heading', { name: 'Your groups' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Create group/ })).toBeInTheDocument()
    expect(screen.getByRole('status').parentElement?.getAttribute('style')).toContain('88px')
  })
})
