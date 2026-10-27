import { screen } from '@testing-library/react'
import { eventArrivals, expenseEvents } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { ActivityPage } from '../index.tsx'

export const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
export const priya = { email: 'priya@gmail.com', name: 'Priya Shah' }

/** The in-memory database, with a group of the user and Priya and the user signed in. */
export function setUpActivityTests() {
  const testDb = setUpTestDatabase()

  async function createGroup(name = 'Goa trip') {
    useAuthStore.setState({ profile: me, guest: false, token: null })
    const result = await createTestGroup(testDb.db, me, { name, type: 'trip', defaultCurrency: 'GBP', memberEmails: [priya.email] })
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    return result.groupId
  }

  /** An expense by Priya (as if a sync brought it in): its event is marked as arrived at `arrivedAt`. */
  async function addArrivedExpense(groupId: string, description: string, arrivedAt: Date) {
    const expenseId = await addTestExpense(testDb.db, priya.email, groupId, { description })
    const events = await testDb.db.select().from(expenseEvents)
    const added = events.find((event) => event.expenseId === expenseId)!
    await testDb.db.insert(eventArrivals).values({ eventId: added.id, arrivedAt })
    return { expenseId, eventId: added.id }
  }

  return { testDb, createGroup, addArrivedExpense }
}

export function renderActivity(state?: unknown) {
  return renderPage(<ActivityPage />, {
    path: ROUTES.activity,
    routes: [ROUTES.home, ROUTES.expenseVersionPattern],
    state,
  })
}

/** The rows of the feed (not the bullets inside them). */
export const rows = () =>
  Array.from(screen.getByRole('list', { name: 'Activity' }).children).filter((child) => child.getAttribute('role') === 'listitem') as HTMLElement[]
