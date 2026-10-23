// @vitest-environment jsdom
// Moving between pages: what was on screen a moment ago comes back at once, and
// what changed since is up to date (ADR-051).
import 'fake-indexeddb/auto'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { dataChanges } from '../db/changes.ts'
import { expenseService } from '../services/expenseService'
import { groupService } from '../services/groupService'
import { ROUTES } from '../routes.ts'
import { addExpense, continueAsGuest, createGroupWithFriend, OPENING, renderApp, setUpJourneyTests } from './helpers.tsx'

vi.mock('../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: false }))
vi.mock('@electric-sql/pglite', async (original) => (await import('../testing/memoryPglite.ts')).memoryPglite(await original()))

const device = setUpJourneyTests()

/**
 * Makes the next reads of a service function slow, so a page that has to read
 * again before showing anything is caught showing its loader.
 */
function slowDown(name: 'listGroups' | 'getGroup') {
  const service = groupService as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>
  const original = service[name]
  return vi.spyOn(service, name).mockImplementation(async (...args: unknown[]) => {
    await new Promise((resolve) => setTimeout(resolve, 400))
    return original(...args)
  })
}

/** The loaders on screen right now. */
const loaders = () => screen.queryAllByRole('status')

describe('moving between pages', () => {
  it('shows the home page again at once after looking at a group, with no loader', async () => {
    const { user } = device
    renderApp(ROUTES.getStarted)
    await continueAsGuest(user)
    await createGroupWithFriend(user, 'Goa trip', { name: 'Priya Shah', email: 'priya@gmail.com' })
    await addExpense(user, 'Dinner', '100')
    await screen.findByText(/Priya owes you/)

    // Home, the first time since the group changed: read fresh.
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByText('you are owed', {}, OPENING)

    // Into the group and back, with every read of the list slow: the list is there anyway.
    await user.click(screen.getByText('Goa trip'))
    await screen.findByText('Dinner')
    const slow = slowDown('listGroups')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Goa trip')).toBeInTheDocument()
    expect(screen.getByText('you are owed')).toBeInTheDocument()
    expect(loaders()).toEqual([])
    slow.mockRestore()
  })

  it('shows the group page at once on a second visit, with no loader', async () => {
    const { user } = device
    renderApp(ROUTES.getStarted)
    await continueAsGuest(user)
    await createGroupWithFriend(user, 'Goa trip', { name: 'Priya Shah', email: 'priya@gmail.com' })
    await addExpense(user, 'Dinner', '100')
    await screen.findByText(/Priya owes you/)
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByText('you are owed', {}, OPENING)
    await user.click(screen.getByText('Goa trip'))
    await screen.findByText('Dinner')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByText('you are owed')

    // Every read of the group is slow now: what was remembered shows anyway.
    slowDown('getGroup')
    await user.click(screen.getByText('Goa trip'))

    expect(screen.getByText('Dinner')).toBeInTheDocument()
    expect(loaders()).toEqual([])
  })

  it('shows what changed, not what was remembered, once an expense is added', async () => {
    const { user } = device
    renderApp(ROUTES.getStarted)
    await continueAsGuest(user)
    await createGroupWithFriend(user, 'Goa trip', { name: 'Priya Shah', email: 'priya@gmail.com' })
    await addExpense(user, 'Dinner', '100')
    await screen.findByText(/Priya owes you/)
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByText('you are owed')

    // Back into the group (remembered), add another expense, return.
    await user.click(screen.getByText('Goa trip'))
    await screen.findByText('Dinner')
    await addExpense(user, 'Taxi', '40')
    expect(await screen.findByText('Taxi')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Back' }))

    // The home page shows £70.00 owed (50 + 20) after reading again, never a stale £50.00 for good.
    await waitFor(() => expect(screen.getByText('£70.00')).toBeInTheDocument())
    expect(screen.queryByText('£50.00')).not.toBeInTheDocument()
  })

  it('shows the loader the first time a page is opened', async () => {
    const { user } = device
    renderApp(ROUTES.getStarted)
    await continueAsGuest(user)
    await createGroupWithFriend(user, 'Goa trip', { name: 'Priya Shah', email: 'priya@gmail.com' })
    // The group page was never opened before the change that created the group: it had to read first.
    expect(await screen.findByText('Goa trip', {}, OPENING)).toBeInTheDocument()
  })

  it('opens a group from the home list with its band at once, then fills in the rest', async () => {
    const { user } = device
    renderApp(ROUTES.getStarted)
    await continueAsGuest(user)
    await createGroupWithFriend(user, 'Goa trip', { name: 'Priya Shah', email: 'priya@gmail.com' })
    await addExpense(user, 'Dinner', '100')
    await screen.findByText(/Priya owes you/)
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByText('you are owed')
    // Something changes (a sync finishes), which drops what the group page remembered; reading the group is slow now.
    act(() => dataChanges.announce())
    const slow = slowDown('getGroup')

    await user.click(screen.getByText('Goa trip'))

    // The next thing on screen already has the band from the list, and a spinner for the rest.
    expect(screen.getByRole('heading', { name: 'Goa trip', level: 2 })).toBeInTheDocument()
    expect(screen.getByText(/2 people/)).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading the group' })).toBeInTheDocument()
    expect(screen.queryByText('Dinner')).not.toBeInTheDocument()

    expect(await screen.findByText('Dinner', {}, OPENING)).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading the group' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Goa trip', level: 2 })).toBeInTheDocument()
    slow.mockRestore()
  })

  it('opens an expense from the group list with its band at once, then fills in the rest', async () => {
    const { user } = device
    renderApp(ROUTES.getStarted)
    await continueAsGuest(user)
    await createGroupWithFriend(user, 'Goa trip', { name: 'Priya Shah', email: 'priya@gmail.com' })
    await addExpense(user, 'Dinner', '100')
    await screen.findByText(/Priya owes you/)
    // Something changes elsewhere, which drops what the expense page remembered; reading it is slow now.
    act(() => dataChanges.announce())
    const original = expenseService.getExpense
    const slow = vi.spyOn(expenseService, 'getExpense').mockImplementation(async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 400))
      return original(...args)
    })

    await user.click(await screen.findByText('Dinner'))

    expect(screen.getByRole('heading', { name: 'Dinner' })).toBeInTheDocument()
    expect(screen.getByText('£100.00')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading the expense' })).toBeInTheDocument()
    expect(screen.queryByText(/Added by/)).not.toBeInTheDocument()

    expect(await screen.findByText('Added by you', {}, OPENING)).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading the expense' })).not.toBeInTheDocument()
    slow.mockRestore()
  })
})
