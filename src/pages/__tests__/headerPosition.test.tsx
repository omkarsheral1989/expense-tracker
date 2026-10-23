// @vitest-environment jsdom
// The header row (Back button and title) sits the same distance below the
// status bar on every page (ADR-030, HEADER_TOP_PADDING).
import 'fake-indexeddb/auto'
import { cleanup, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../db/client.ts'
import { expenseEvents } from '../../db/schema.ts'
import { ROUTES } from '../../routes.ts'
import { useAuthStore } from '../../stores/useAuthStore'
import { HEADER_TOP_PADDING } from '../../theme/safeArea.ts'
import { setUpTestDatabase } from '../../testing/database.ts'
import { addTestExpense } from '../../testing/expenses.ts'
import { createTestGroup, ensurePersonId } from '../../testing/groups.ts'
import { renderPage } from '../../testing/render.tsx'
import { AddExpensePage } from '../addExpense/index.tsx'
import { CreateGroupPage } from '../createGroup/index.tsx'
import { EditExpensePage } from '../editExpense/index.tsx'
import { EditGroupPage } from '../editGroup/index.tsx'
import { ExpensePage } from '../expense/index.tsx'
import { GroupPage } from '../group/index.tsx'
import { ExpenseVersionPage } from '../expenseVersion/index.tsx'
import { MembersPage } from '../members/index.tsx'
import { SettleUpPage } from '../settleUp/index.tsx'

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
const EXPECTED = `calc(${HEADER_TOP_PADDING}px + env(safe-area-inset-top))`

beforeEach(async () => {
  useAuthStore.setState({ profile: me, guest: false, token: null })
  await ensurePersonId(testDb.db, me.email, me.name)
})
afterEach(() => {
  cleanup()
  vi.mocked(getDb).mockReset()
})

/** The top padding of the closest block around the Back button that pads for the status bar. */
function paddingAboveHeader() {
  let element: HTMLElement | null = screen.getByRole('button', { name: 'Back' })
  while (element) {
    const style = element.getAttribute('style') ?? ''
    if (style.includes('env(safe-area-inset-top)')) return style
    element = element.parentElement
  }
  return null
}

type Page = { name: string; page: (ids: { group: string; expense: string }) => ReactElement; path: (ids: { group: string; expense: string }) => string; pattern: string }

const PAGES: Page[] = [
  { name: 'the group page', page: () => <GroupPage />, path: ({ group }) => ROUTES.group(group), pattern: ROUTES.groupPattern },
  { name: 'the expense page', page: () => <ExpensePage />, path: ({ group, expense }) => ROUTES.expense(group, expense), pattern: ROUTES.expensePattern },
  { name: 'edit expense', page: () => <EditExpensePage />, path: ({ group, expense }) => ROUTES.editExpense(group, expense), pattern: ROUTES.editExpensePattern },
  { name: 'add expense', page: () => <AddExpensePage />, path: ({ group }) => ROUTES.newExpense(group), pattern: ROUTES.newExpensePattern },
  { name: 'settle up', page: () => <SettleUpPage />, path: ({ group }) => ROUTES.settleUp(group), pattern: ROUTES.settleUpPattern },
  { name: 'edit group', page: () => <EditGroupPage />, path: ({ group }) => ROUTES.editGroup(group), pattern: ROUTES.editGroupPattern },
  { name: 'create group', page: () => <CreateGroupPage />, path: () => ROUTES.newGroup, pattern: ROUTES.newGroup },
  { name: 'the members page', page: () => <MembersPage />, path: () => ROUTES.members, pattern: ROUTES.members },
]

describe.each(PAGES)('$name', ({ page, path, pattern }) => {
  it('puts its header the shared distance below the status bar', async () => {
    const created = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
    if (!created.ok) throw new Error('group')
    const expense = await addTestExpense(testDb.db, me.email, created.groupId, { description: 'Dinner', amountMinor: 900 })
    vi.mocked(getDb).mockImplementation(async () => testDb.db)
    const ids = { group: created.groupId, expense }

    renderPage(page(ids), { path: path(ids), pattern, routes: [ROUTES.home, ROUTES.groupPattern, ROUTES.expensePattern] })
    await screen.findByRole('button', { name: 'Back' })

    expect(paddingAboveHeader()).toContain(EXPECTED)
  })
})

async function setUpGroup() {
  const created = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
  if (!created.ok) throw new Error('group')
  const expense = await addTestExpense(testDb.db, me.email, created.groupId, { description: 'Dinner', amountMinor: 900 })
  return { group: created.groupId, expense }
}

describe('the pages around the others', () => {
  it('puts the header of a version of an expense the shared distance below the status bar', async () => {
    const { group, expense } = await setUpGroup()
    const [event] = await testDb.db.select().from(expenseEvents)
    vi.mocked(getDb).mockImplementation(async () => testDb.db)

    renderPage(<ExpenseVersionPage />, {
      path: ROUTES.expenseVersion(group, expense, event.id),
      pattern: ROUTES.expenseVersionPattern,
      routes: [ROUTES.expensePattern, ROUTES.groupPattern],
    })
    await screen.findByRole('button', { name: 'Back' })

    expect(paddingAboveHeader()).toContain(EXPECTED)
  })

  it('puts the header of a form that is still loading the shared distance below the status bar', async () => {
    const { group } = await setUpGroup()
    vi.mocked(getDb).mockImplementation(() => new Promise(() => {}))

    renderPage(<AddExpensePage />, {
      path: ROUTES.newExpense(group),
      pattern: ROUTES.newExpensePattern,
      routes: [ROUTES.groupPattern],
      state: { group: { id: group, name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberCount: 2 } },
    })

    expect(await screen.findByRole('status', { name: 'Loading the group' })).toBeInTheDocument()
    expect(paddingAboveHeader()).toContain(EXPECTED)
  })

  it('puts the Back button of a page that could not load the shared distance below the status bar', async () => {
    const { group } = await setUpGroup()
    vi.mocked(getDb).mockRejectedValue(new Error('database is closed'))

    renderPage(<GroupPage />, { path: ROUTES.group(group), pattern: ROUTES.groupPattern, routes: [ROUTES.home] })
    await screen.findByText("Couldn't load this group")

    expect(paddingAboveHeader()).toContain(EXPECTED)
  })
})

describe('HEADER_TOP_PADDING', () => {
  it('is 16, the distance the colored bands always used', () => {
    expect(HEADER_TOP_PADDING).toBe(16)
  })
})
