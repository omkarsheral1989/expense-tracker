import { screen } from '@testing-library/react'
import { ROUTES } from '../../../routes.ts'
import { accountService } from '../../../services/accountService'
import type { AccountInput } from '../../../services/accountService/types.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { personIdOf } from '../../../testing/expenses.ts'
import { ensurePersonId } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { AccountsPage } from '../index.tsx'

export const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }

/** The in-memory database, with the user's own person saved (the gate does it in the app). */
export function setUpAccountsTests() {
  const testDb = setUpTestDatabase()

  async function setUpUser() {
    useAuthStore.setState({ profile: me, guest: false, token: null })
    await ensurePersonId(testDb.db, me.email, me.name)
  }

  /** Saves an account of the user's and returns its id; fails the test if it was refused. */
  async function addAccount(input: AccountInput) {
    const result = await accountService.createAccount(testDb.db, await personIdOf(testDb.db, me.email), input)
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result)}`)
    return result.accountId
  }

  return { testDb, setUpUser, addAccount }
}

export function renderAccounts() {
  return renderPage(<AccountsPage />, { path: ROUTES.accounts, routes: [ROUTES.home] })
}

/** The card of one account, found by its name ("Edit Savings"). */
export const card = (name: string) => screen.getByRole('button', { name: `Edit ${name}` })
