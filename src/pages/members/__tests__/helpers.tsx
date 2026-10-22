import { screen } from '@testing-library/react'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { ensurePersonId } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { MembersPage } from '../index.tsx'

export const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }

/** The in-memory database, with the user's own person saved (the gate does it in the app). */
export function setUpMembersTests() {
  const testDb = setUpTestDatabase()

  async function setUpUser() {
    useAuthStore.setState({ profile: me, guest: false, token: null })
    await ensurePersonId(testDb.db, me.email, me.name)
  }

  return { testDb, setUpUser }
}

export function renderMembers() {
  return renderPage(<MembersPage />, { path: ROUTES.members, routes: [ROUTES.home] })
}

/** The card of one person, found by its name ("Edit Sam"). */
export const card = (name: string) => screen.getByRole('button', { name: `Edit ${name}` })
