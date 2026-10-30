// @vitest-environment jsdom
// The group page opened from the home list: it shows what the list knew while
// the rest loads (ADR-052).
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { GroupPage } from '../index.tsx'
import type { GroupPageState } from '../types.ts'

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
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  useAuthStore.setState({ profile: me, token: null })
})
afterEach(() => {
  cleanup()
  vi.mocked(getDb).mockReset()
})

async function createGroup(name = 'Goa trip') {
  const result = await createTestGroup(testDb.db, me, {
    name,
    type: 'home',
    defaultCurrency: 'GBP',
    memberEmails: ['priya@gmail.com'],
  })
  if (!result.ok) throw new Error('group')
  vi.mocked(getDb).mockImplementation(async () => testDb.db)
  return result.groupId
}

/** What the home list hands over for a group. */
function opened(id: string, overrides: Partial<GroupPageState['group']> = {}): GroupPageState {
  return { group: { id, name: 'Goa trip', type: 'home', defaultCurrency: 'GBP', memberCount: 2, ...overrides } }
}

/** A group page whose data is held back until `release` is called, opened with this state. */
function renderHeld(id: string, state?: unknown) {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  vi.mocked(getDb).mockImplementation(async () => {
    await held
    return testDb.db
  })
  const page = renderPage(<GroupPage />, {
    path: ROUTES.group(id),
    pattern: ROUTES.groupPattern,
    routes: [ROUTES.home, ROUTES.editGroupPattern, ROUTES.newExpensePattern],
    state,
  })
  return { ...page, release }
}

describe('the group page while it loads, opened from the home list', () => {
  it('shows the band with the name, type, currency and number of members at once', async () => {
    const id = await createGroup()
    renderHeld(id, opened(id, { name: 'Goa trip', memberCount: 2 }))

    expect(screen.getByRole('heading', { name: 'Goa trip', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByText('£')).toBeInTheDocument()
    expect(screen.getByText(/2 members/)).toBeInTheDocument()
  })

  it('says "1 member" for a group of one', async () => {
    const id = await createGroup()
    renderHeld(id, opened(id, { memberCount: 1 }))
    expect(screen.getByText(/1 member/)).toBeInTheDocument()
  })

  it('shows a spinner with its label where the balance and expenses will be, and no balance or expense list', async () => {
    const id = await createGroup()
    renderHeld(id, opened(id))

    expect(screen.getByRole('status', { name: 'Loading the group' })).toHaveTextContent('Loading the group…')
    expect(screen.queryByText(/settled up|owes you|You owe/)).not.toBeInTheDocument()
    expect(screen.queryByText('No expenses yet')).not.toBeInTheDocument()
  })

  it('has Add expense, and Back, Sync and Edit group, working at once', async () => {
    const id = await createGroup()
    const page = renderHeld(id, opened(id))

    expect(screen.getByRole('button', { name: /Add expense/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Sync' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'More options' }))
    await user.click(await screen.findByRole('menuitem', { name: /Edit group/ }))
    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.editGroup(id)))
  })

  it('opens the add-expense page at once', async () => {
    const id = await createGroup()
    const page = renderHeld(id, opened(id))
    await user.click(screen.getByRole('button', { name: /Add expense/ }))
    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.newExpense(id)))
  })

  it('switches off Settle up and the people chip, with no tip about being the only member, until the members are known', async () => {
    const id = await createGroup()
    renderHeld(id, opened(id))

    expect(screen.getByRole('button', { name: 'Settle up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /2 members$/ })).toBeDisabled()
    // A pill wrapped for the "only member" tip would sit in a span of its own; while loading there is no such tip.
    expect(screen.getByRole('button', { name: 'Settle up' }).closest('[data-settle-pill]')?.parentElement?.tagName).toBe('DIV')
  })

  it('sets the tab title from the known name', async () => {
    const id = await createGroup()
    renderHeld(id, opened(id, { name: 'Goa trip' }))
    await waitFor(() => expect(document.title).toBe('Goa trip · OwnLedger'))
  })

  describe('when the data arrives', () => {
    it('fills in the balance, expenses and members, and switches the buttons on', async () => {
      const id = await createGroup()
      await addTestExpense(testDb.db, me.email, id, { description: 'Beach shack dinner', amountMinor: 1000 })
      const { release } = renderHeld(id, opened(id))
      expect(screen.queryByText('Beach shack dinner')).not.toBeInTheDocument()

      release()

      expect(await screen.findByText('Beach shack dinner')).toBeInTheDocument()
      expect(screen.queryByRole('status', { name: 'Loading the group' })).not.toBeInTheDocument()
      expect(screen.getByText(/Priya owes you/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Settle up' })).toBeEnabled()
      await user.click(screen.getByRole('button', { name: /2 members$/ }))
      expect(await screen.findByRole('dialog', { name: 'Members (2)' })).toBeInTheDocument()
    })

    it('replaces what the list knew with the real data', async () => {
      const id = await createGroup('Goa trip')
      // The list was out of date: another name and a count of 5.
      const { release } = renderHeld(id, opened(id, { name: 'Old name', memberCount: 5 }))
      expect(screen.getByRole('heading', { name: 'Old name' })).toBeInTheDocument()
      expect(screen.getByText(/5 members/)).toBeInTheDocument()

      release()

      expect(await screen.findByRole('heading', { name: 'Goa trip' })).toBeInTheDocument()
      expect(screen.getByText(/2 members/)).toBeInTheDocument()
      await waitFor(() => expect(document.title).toBe('Goa trip · OwnLedger'))
    })

    it('shows "Group not found" if the group is gone', async () => {
      await createGroup()
      const { release } = renderHeld('3f2a9c1e-0000-4000-8000-000000000009', opened('3f2a9c1e-0000-4000-8000-000000000009'))
      release()
      expect(await screen.findByText('Group not found')).toBeInTheDocument()
    })

    it('shows the error with Try again if reading fails', async () => {
      const id = await createGroup()
      vi.mocked(getDb).mockRejectedValue(new Error('database is closed'))
      renderPage(<GroupPage />, { path: ROUTES.group(id), pattern: ROUTES.groupPattern, routes: [ROUTES.home], state: opened(id) })
      expect(await screen.findByText("Couldn't load this group")).toBeInTheDocument()
      expect(within(document.body).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    })
  })
})

describe('the pages the group page opens', () => {
  function StateProbe() {
    return <pre data-testid="state">{JSON.stringify(useLocation().state)}</pre>
  }

  /** Renders the loaded group page and opens a control; returns the state the next page was given. */
  async function openFrom(control: () => HTMLElement, route: string, then?: () => Promise<HTMLElement>) {
    const id = await createGroup()
    renderPage(<GroupPage />, { path: ROUTES.group(id), pattern: ROUTES.groupPattern, routes: [ROUTES.home], extra: [{ path: route, element: <StateProbe /> }] })
    await screen.findByRole('heading', { name: 'Goa trip', level: 2 })
    await user.click(control())
    if (then) await user.click(await then())
    return { id, state: JSON.parse((await screen.findByTestId('state')).textContent ?? 'null') }
  }

  const known = (id: string) => ({ group: { id, name: 'Goa trip', type: 'home', defaultCurrency: 'GBP', memberCount: 2 } })

  it('hands Add expense the group, so it opens with its header', async () => {
    const { id, state } = await openFrom(() => screen.getByRole('button', { name: /Add expense/ }), ROUTES.newExpensePattern)
    expect(state).toEqual(known(id))
  })

  it('hands Settle up the group', async () => {
    const { id, state } = await openFrom(() => screen.getByRole('button', { name: 'Settle up' }), ROUTES.settleUpPattern)
    expect(state).toEqual(known(id))
  })

  it('hands Edit group the group', async () => {
    const { id, state } = await openFrom(() => screen.getByRole('button', { name: 'More options' }), ROUTES.editGroupPattern, () => screen.findByRole('menuitem', { name: /Edit group/ }))
    expect(state).toEqual(known(id))
  })
})

describe('the group page while it loads, opened any other way', () => {
  it.each([
    ['with no state (a direct link)', undefined],
    ['with the state of another group', 'other'],
    ['with a state that is not a group', { something: 1 }],
  ])('shows only the loader %s', async (_name, kind) => {
    const id = await createGroup()
    const state = kind === 'other' ? opened('3f2a9c1e-0000-4000-8000-000000000009') : kind
    renderHeld(id, state)

    expect(screen.getByRole('status', { name: 'Loading the group' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add expense/ })).not.toBeInTheDocument()
  })
})
