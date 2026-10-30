// @vitest-environment jsdom
// Page changes slide the way a person expects (PRD 5.15, ADR-057): pages that are
// opened slide forward, and every way of going back slides back.
import 'fake-indexeddb/auto'
import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '../routes.ts'
import { stubViewTransition } from '../testing/viewTransition.ts'
import { addExpense, continueAsGuest, createGroupWithFriend, OPENING, renderApp, setUpJourneyTests } from './helpers.tsx'

vi.mock('../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: false }))
vi.mock('@electric-sql/pglite', async (original) => (await import('../testing/memoryPglite.ts')).memoryPglite(await original()))

const device = setUpJourneyTests()

let transitions: ReturnType<typeof stubViewTransition>
beforeEach(() => {
  transitions = stubViewTransition()
})
afterEach(() => transitions.restore())

/** The slides started since the last call, then forgotten. */
function slides() {
  const seen = [...transitions.started]
  transitions.started.length = 0
  return seen
}

describe('page transitions', () => {
  it('slides forward into a page that is opened and back out of it, through every way of leaving', async () => {
    const { user } = device
    renderApp(ROUTES.getStarted)
    await continueAsGuest(user)
    await createGroupWithFriend(user, 'Goa trip', { name: 'Priya Shah', email: 'priya@gmail.com' })
    await screen.findByText('Goa trip')
    // Creating a group opens its page: forward.
    expect(slides()).toContain('forward')

    // The Back arrow of the group page.
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByText('Your groups', {}, OPENING)
    expect(slides()).toEqual(['back'])

    // A group's row opens it: forward.
    await user.click(screen.getByText('Goa trip'))
    await screen.findByRole('button', { name: /Add expense/ })
    expect(slides()).toEqual(['forward'])

    // Add expense opens a form (forward); its Back arrow, with nothing entered, goes back.
    await user.click(screen.getByRole('button', { name: /Add expense/ }))
    await screen.findByRole('textbox', { name: 'Description' })
    expect(slides()).toEqual(['forward'])
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByRole('button', { name: /Add expense/ })
    expect(slides()).toEqual(['back'])

    // Saving a form returns to the group: back.
    await addExpense(user, 'Dinner', '100')
    await screen.findByText('Dinner')
    expect(slides().at(-1)).toBe('back')

    // An expense's row opens it (forward), and its Back arrow returns (back).
    slides()
    await user.click(screen.getByText('Dinner'))
    await screen.findByRole('heading', { name: 'Expense', level: 3 })
    expect(slides()).toEqual(['forward'])
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByText('Dinner')
    expect(slides()).toEqual(['back'])
  })

  it('slides forward into a form and back out of it with Cancel', async () => {
    const { user } = device
    renderApp(ROUTES.getStarted)
    await continueAsGuest(user)
    await screen.findByText('Your groups', {}, OPENING)
    slides()

    await user.click(screen.getByRole('button', { name: /Create group/ }))
    await screen.findByRole('textbox', { name: 'Group name' })
    expect(slides()).toEqual(['forward'])
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Group name' })).not.toBeInTheDocument())
    expect(slides()).toEqual(['back'])
  })

  it('slides forward into Edit group and back out of it with its Back arrow, and the same for the members page', async () => {
    const { user } = device
    renderApp(ROUTES.getStarted)
    await continueAsGuest(user)
    await createGroupWithFriend(user, 'Goa trip', { name: 'Priya Shah', email: 'priya@gmail.com' })
    await screen.findByText('Goa trip')
    slides()

    await user.click(screen.getByRole('button', { name: 'More options' }))
    await user.click(await screen.findByRole('menuitem', { name: /Edit group/ }))
    await screen.findByRole('heading', { name: 'Edit group' })
    expect(slides()).toEqual(['forward'])
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByText('Goa trip')
    expect(slides()).toEqual(['back'])

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByText('Your groups', {}, OPENING)
    slides()
    await user.click(screen.getByRole('button', { name: /Account|Guest|G$/ }))
    await user.click(await screen.findByText('Group members'))
    await screen.findByRole('heading', { name: 'Group members' })
    expect(slides()).toEqual(['forward'])
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByText('Your groups')
    expect(slides()).toEqual(['back'])
  })
})
