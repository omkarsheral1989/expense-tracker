import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import App from '../App.tsx'
import { closeDatabase } from '../db/client.ts'
import { sharedFiles } from '../pwa/sharedFiles.ts'
import { useAuthStore } from '../stores/useAuthStore'
import { renderPage } from '../testing/render.tsx'
import { forgetDatabases } from '../testing/memoryPglite.ts'

// Whole-app tests render the real `App`, so each test file mocks these two
// modules the same way (a `vi.mock` is hoisted, so it cannot live here):
//
//   vi.mock('../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: false }))
//   vi.mock('@electric-sql/pglite', async (original) =>
//     (await import('../testing/memoryPglite.ts')).memoryPglite(await original()))

/** A database opens and a page reads it a few times in a journey; allow for a slow machine. */
export const OPENING = { timeout: 20_000 }

export type User = ReturnType<typeof userEvent.setup>

/** Sets up a journey test file: a signed-out device, English (UK) so money is in pounds, and a clean-up after each test. */
export function setUpJourneyTests() {
  const state = { user: userEvent.setup() }

  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ profile: null, guest: false, token: null, driveToken: null })
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-GB'])
    state.user = userEvent.setup()
  })

  afterEach(async () => {
    cleanup()
    await closeDatabase()
    await forgetDatabases()
    await sharedFiles.clear()
    vi.restoreAllMocks()
  })

  return state
}

export function renderApp(path: string) {
  return renderPage(<App />, { path, pattern: '/*' })
}

/** The app closed and opened again on the same device: the screen goes, the stored data stays. */
export async function reopenApp(path: string) {
  cleanup()
  await closeDatabase()
  return renderApp(path)
}

export async function continueAsGuest(user: User) {
  await user.click(await screen.findByRole('button', { name: /Continue as a guest/ }))
  await screen.findByRole('heading', { name: 'Your groups' }, OPENING)
}

/** Creates a trip with one friend added through the "Add a new member" dialog, from the home page. */
export async function createGroupWithFriend(user: User, groupName: string, friend: { name: string; email: string }) {
  await user.click(screen.getByRole('button', { name: /Create group/ }))
  await user.type(await screen.findByRole('textbox', { name: 'Group name' }), groupName)
  await user.click(screen.getByRole('combobox', { name: 'Members' }))
  await user.click(await screen.findByRole('button', { name: /Add a new member/ }))
  const dialog = await screen.findByRole('dialog', { name: 'Add a new member' })
  await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), friend.name)
  await user.type(within(dialog).getByRole('textbox', { name: 'Email (optional)' }), friend.email)
  await user.click(within(dialog).getByRole('button', { name: 'Add' }))
  // The person is saved first, then chosen as a member; create only once they are.
  await waitFor(() => expect(document.querySelector('.ant-select-selection-item')).toHaveTextContent(friend.name))
  await user.click(screen.getByRole('button', { name: 'Create group' }))
  await screen.findByText('Group created.')
}

/** Adds an expense paid by the user and split equally, from a group's page. */
export async function addExpense(user: User, description: string, amount: string) {
  await user.click(await screen.findByRole('button', { name: /Add expense/ }))
  await user.type(await screen.findByRole('textbox', { name: 'Description' }), description)
  await user.type(screen.getByRole('textbox', { name: 'Amount' }), amount)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByText('Expense added.')
}

/** Opens a select and picks the entry with this name. */
export async function pick(user: User, select: HTMLElement, name: string) {
  await user.click(select)
  const dropdown = await waitFor(() => {
    const open = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)') as HTMLElement | null
    if (!open) throw new Error('no dropdown')
    return open
  })
  await user.click(within(dropdown).getByText(name, { selector: '.ant-select-item-option-content' }))
}
