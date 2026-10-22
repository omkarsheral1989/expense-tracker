// @vitest-environment jsdom
import { cleanup } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '../../routes.ts'
import { useAuthStore } from '../../stores/useAuthStore'
import { renderPage } from '../../testing/render.tsx'
import { AddExpensePage } from '../addExpense/index.tsx'
import { CreateGroupPage } from '../createGroup/index.tsx'
import { EditExpensePage } from '../editExpense/index.tsx'
import { EditGroupPage } from '../editGroup/index.tsx'
import { ExpensePage } from '../expense/index.tsx'
import { ExpenseVersionPage } from '../expenseVersion/index.tsx'
import { GetStartedPage } from '../getStarted/index.tsx'
import { GroupPage } from '../group/index.tsx'
import { MembersPage } from '../members/index.tsx'
import { SettleUpPage } from '../settleUp/index.tsx'
import { Footer } from '../welcome/components/Footer/index.tsx'

// The data never arrives, so every page shows its loading state, inside the column whose padding is checked.
vi.mock('../../db/client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../db/client.ts')>()),
  getDb: vi.fn(() => new Promise(() => {})),
}))
vi.mock('../../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: false }))

const GROUP = '3f2a9c1e-0000-4000-8000-000000000001'
const EXPENSE = '3f2a9c1e-0000-4000-8000-000000000002'
const EVENT = '3f2a9c1e-0000-4000-8000-000000000003'

const CASES: { name: string; page: ReactElement; path: string; pattern?: string; signedOut?: boolean }[] = [
  { name: 'create group', page: <CreateGroupPage />, path: ROUTES.newGroup },
  { name: 'edit group', page: <EditGroupPage />, path: ROUTES.editGroup(GROUP), pattern: ROUTES.editGroupPattern },
  { name: 'the members page', page: <MembersPage />, path: ROUTES.members },
  { name: 'settle up', page: <SettleUpPage />, path: ROUTES.settleUp(GROUP), pattern: ROUTES.settleUpPattern },
  { name: 'add expense', page: <AddExpensePage />, path: ROUTES.newExpense(GROUP), pattern: ROUTES.newExpensePattern },
  { name: 'edit expense', page: <EditExpensePage />, path: ROUTES.editExpense(GROUP, EXPENSE), pattern: ROUTES.editExpensePattern },
  { name: 'the expense page', page: <ExpensePage />, path: ROUTES.expense(GROUP, EXPENSE), pattern: ROUTES.expensePattern },
  { name: 'a version of an expense', page: <ExpenseVersionPage />, path: ROUTES.expenseVersion(GROUP, EXPENSE, EVENT), pattern: ROUTES.expenseVersionPattern },
  { name: 'the group page', page: <GroupPage />, path: ROUTES.group(GROUP), pattern: ROUTES.groupPattern },
  { name: 'the Open OwnLedger page', page: <GetStartedPage />, path: ROUTES.getStarted, signedOut: true },
]

beforeEach(() => useAuthStore.setState({ profile: { id: '1', email: 'omkar@gmail.com', name: 'Omkar' }, guest: false, token: null }))
afterEach(cleanup)

/** Whether something on the page pads its top by the status bar and its bottom by the screen's bottom inset. */
const padsBothEnds = () =>
  [...document.querySelectorAll<HTMLElement>('[style*="env(safe-area-inset-bottom)"]')].some((element) =>
    element.getAttribute('style')?.includes('env(safe-area-inset-top)'),
  )

describe.each(CASES)('$name', ({ page, path, pattern, signedOut }) => {
  it('keeps its content clear of the status bar at the top and of the home indicator and rounded corners at the bottom', () => {
    // The page for people who are not in yet sends anyone signed in on.
    if (signedOut) useAuthStore.setState({ profile: null, guest: false })
    renderPage(page, { path, pattern, routes: [ROUTES.home, ROUTES.welcome] })

    expect(padsBothEnds()).toBe(true)
  })
})

describe('the welcome page footer', () => {
  it('ends above the home indicator and the rounded corners', () => {
    renderPage(<Footer />)

    const footer = document.querySelector('footer')!
    expect(footer.getAttribute('style')).toContain('calc(40px + env(safe-area-inset-bottom))')
  })
})
