// @vitest-environment jsdom
// Add expense, Settle up and Edit group opened from the group page: their own
// header shows at once with a spinner for the rest (ADR-054).
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../db/client.ts'
import { ROUTES } from '../../routes.ts'
import { useAuthStore } from '../../stores/useAuthStore'
import { setUpTestDatabase } from '../../testing/database.ts'
import { createTestGroup } from '../../testing/groups.ts'
import { renderPage } from '../../testing/render.tsx'
import { AddExpensePage } from '../addExpense/index.tsx'
import { EditGroupPage } from '../editGroup/index.tsx'
import { SettleUpPage } from '../settleUp/index.tsx'
import type { GroupPageState } from '../group/types.ts'

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

beforeEach(() => useAuthStore.setState({ profile: me, token: null }))
afterEach(() => {
  cleanup()
  vi.mocked(getDb).mockReset()
})

async function createGroup() {
  const result = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
  if (!result.ok) throw new Error('group')
  return result.groupId
}

function opened(id: string, overrides: Partial<GroupPageState['group']> = {}): GroupPageState {
  return { group: { id, name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberCount: 2, ...overrides } }
}

type Case = {
  name: string
  page: ReactElement
  path: (id: string) => string
  pattern: string
  heading: string
  title: string
  showsGroup: boolean
  /** The field that is on the page once the form has loaded. */
  field: string
}

const CASES: Case[] = [
  { name: 'add expense', page: <AddExpensePage />, path: ROUTES.newExpense, pattern: ROUTES.newExpensePattern, heading: 'Add expense', title: 'Add expense · OwnLedger', showsGroup: true, field: 'Description' },
  { name: 'settle up', page: <SettleUpPage />, path: ROUTES.settleUp, pattern: ROUTES.settleUpPattern, heading: 'Settle up', title: 'Settle up · OwnLedger', showsGroup: true, field: 'Amount' },
  { name: 'edit group', page: <EditGroupPage />, path: ROUTES.editGroup, pattern: ROUTES.editGroupPattern, heading: 'Edit group', title: 'Edit group · OwnLedger', showsGroup: false, field: 'Group name' },
]

function renderHeld(testCase: Case, id: string, state?: unknown) {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  vi.mocked(getDb).mockImplementation(async () => {
    await held
    return testDb.db
  })
  const page = renderPage(testCase.page, { path: testCase.path(id), pattern: testCase.pattern, routes: [ROUTES.groupPattern, ROUTES.home], state })
  return { ...page, release }
}

describe.each(CASES)('$name while it loads, opened from the group page', (testCase) => {
  it('shows its own header with Save switched off, and a spinner, at once', async () => {
    const id = await createGroup()
    renderHeld(testCase, id, opened(id))

    expect(screen.getByRole('heading', { name: testCase.heading, level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('status', { name: 'Loading the group' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: testCase.field })).not.toBeInTheDocument()
  })

  it('sets the tab title', async () => {
    const id = await createGroup()
    renderHeld(testCase, id, opened(id))
    await waitFor(() => expect(document.title).toBe(testCase.title))
  })

  it(`${testCase.showsGroup ? 'shows' : 'does not show'} the group's name`, async () => {
    const id = await createGroup()
    renderHeld(testCase, id, opened(id))
    if (testCase.showsGroup) expect(screen.getByText('Goa trip')).toBeInTheDocument()
    else expect(screen.queryByText('Goa trip')).not.toBeInTheDocument()
  })

  it('goes back to the group with Back', async () => {
    const id = await createGroup()
    const page = renderHeld(testCase, id, opened(id))
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
  })

  it('swaps the shell for the real form when the data arrives', async () => {
    const id = await createGroup()
    const { release } = renderHeld(testCase, id, opened(id))

    release()

    expect(await screen.findByRole('textbox', { name: testCase.field })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading the group' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it.each([
    ['no state (a direct link)', undefined],
    ['the state of another group', 'other'],
    ['a state that is not a group', { something: 1 }],
  ])('shows only the spinner with %s', async (_name, kind) => {
    const id = await createGroup()
    const state = kind === 'other' ? opened('3f2a9c1e-0000-4000-8000-000000000009') : kind
    renderHeld(testCase, id, state)

    expect(screen.getByRole('status', { name: 'Loading the group' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: testCase.heading })).not.toBeInTheDocument()
  })
})
