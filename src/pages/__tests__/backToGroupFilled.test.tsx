// @vitest-environment jsdom
// A page that changes the data and then goes to the group's page reads that page first, so it arrives filled in: no loader, whose
// turning into the page would cut the transition back short (PRD 5.16, ADR-060). The same goes for a group just created.
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useNavigationType } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../db/client.ts'
import { ROUTES } from '../../routes.ts'
import { useAuthStore } from '../../stores/useAuthStore'
import { setUpTestDatabase } from '../../testing/database.ts'
import { addTestExpense } from '../../testing/expenses.ts'
import { createTestGroup, ensurePersonId } from '../../testing/groups.ts'
import { renderPage } from '../../testing/render.tsx'
import { AddExpensePage } from '../addExpense/index.tsx'
import { CreateGroupPage } from '../createGroup/index.tsx'
import { EditGroupPage } from '../editGroup/index.tsx'
import { ExpensePage } from '../expense/index.tsx'
import { GroupPage } from '../group/index.tsx'
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
let user: ReturnType<typeof userEvent.setup>

beforeEach(async () => {
  user = userEvent.setup()
  useAuthStore.setState({ profile: me, guest: false, token: null })
  await ensurePersonId(testDb.db, me.email, me.name)
  vi.mocked(getDb).mockImplementation(async () => testDb.db)
})
afterEach(() => {
  cleanup()
  vi.mocked(getDb).mockReset()
})

async function createGroup() {
  const created = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
  if (!created.ok) throw new Error('group')
  return created.groupId
}

const GROUP_PAGE = { path: ROUTES.groupPattern, element: <GroupPage /> }
const loader = () => screen.queryByRole('status', { name: 'Loading the group' })

/** Waits until the group's page is the one on screen, and says whether it came with its loader. */
async function arrivedAtGroup(page: { currentPath: () => string }, groupId: string) {
  await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(groupId)))
  return { loader: loader() }
}

/** Opens a select and picks the entry with this name. */
async function pick(select: HTMLElement, name: string) {
  await user.click(select)
  const list = await waitFor(() => {
    const open = document.querySelector<HTMLElement>('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    if (!open) throw new Error('No list open yet.')
    return open
  })
  await user.click(within(list).getByText(name, { selector: '.ant-select-item-option-content' }))
}

describe('back to the group after a change', () => {
  it('shows the group with the payment just recorded, and no loader', async () => {
    const groupId = await createGroup()
    const page = renderPage(<SettleUpPage />, { path: ROUTES.settleUp(groupId), pattern: ROUTES.settleUpPattern, extra: [GROUP_PAGE] })
    await pick(await screen.findByRole('combobox', { name: 'Who received it?' }), 'priya@gmail.com')
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '12')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect((await arrivedAtGroup(page, groupId)).loader).toBeNull()
    expect(screen.getByText(/^You paid Priya/)).toBeInTheDocument()
  })

  it('shows the group with the expense just added, and no loader', async () => {
    const groupId = await createGroup()
    const page = renderPage(<AddExpensePage />, { path: ROUTES.newExpense(groupId), pattern: ROUTES.newExpensePattern, extra: [GROUP_PAGE] })
    await user.type(await screen.findByRole('textbox', { name: 'Description' }), 'Lunch')
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '20')

    await user.click(screen.getByRole('button', { name: 'Add expense' }))

    expect((await arrivedAtGroup(page, groupId)).loader).toBeNull()
    expect(screen.getByText('Lunch')).toBeInTheDocument()
  })

  it('shows the group with its new name, and no loader', async () => {
    const groupId = await createGroup()
    const page = renderPage(<EditGroupPage />, { path: ROUTES.editGroup(groupId), pattern: ROUTES.editGroupPattern, extra: [GROUP_PAGE] })
    const name = await screen.findByRole('textbox', { name: 'Group name' })
    await user.clear(name)
    await user.type(name, 'Goa 2026')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect((await arrivedAtGroup(page, groupId)).loader).toBeNull()
    expect(screen.getByRole('heading', { name: 'Goa 2026' })).toBeInTheDocument()
  })

  it('shows the group with the expense just deleted, and no loader', async () => {
    const groupId = await createGroup()
    const expenseId = await addTestExpense(testDb.db, me.email, groupId, { description: 'Dinner' })
    const page = renderPage(<ExpensePage />, { path: ROUTES.expense(groupId, expenseId), pattern: ROUTES.expensePattern, extra: [GROUP_PAGE] })
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))

    expect((await arrivedAtGroup(page, groupId)).loader).toBeNull()
    expect(screen.getByText(/You deleted 'Dinner'/)).toBeInTheDocument()
  })
})

describe('a group just created', () => {
  async function create(extra: { path: string; element: React.ReactElement }) {
    const page = renderPage(<CreateGroupPage />, { path: ROUTES.newGroup, pattern: ROUTES.newGroup, extra: [extra] })
    await user.type(await screen.findByRole('textbox', { name: 'Group name' }), 'Goa trip')
    await user.click(screen.getByRole('button', { name: 'Create group' }))
    await waitFor(() => expect(page.currentPath()).toMatch(/^\/groups\/[0-9a-f-]{36}$/))
    return page
  }

  it('opens its page filled in, with no loader', async () => {
    await create(GROUP_PAGE)

    expect(loader()).toBeNull()
    expect(screen.getByRole('heading', { name: 'Goa trip' })).toBeInTheDocument()
  })

  it('takes Create group\'s place in the history, so Back from it goes to the list, not to the form', async () => {
    function HowItCame() {
      return <p>Came by {useNavigationType()}</p>
    }
    await create({ path: ROUTES.groupPattern, element: <HowItCame /> })

    expect(screen.getByText('Came by REPLACE')).toBeInTheDocument()
  })
})
