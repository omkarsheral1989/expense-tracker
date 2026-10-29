// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { GroupPage } from '../index.tsx'

// The balance line shows the simplified balances of the balances page (PRD 5.4, 5.21).
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

beforeEach(() => useAuthStore.setState({ profile: me, guest: false, token: null }))
afterEach(cleanup)

async function createGroup() {
  const result = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
  if (!result.ok) throw new Error('group')
  await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
  await testDb.db.update(people).set({ name: 'Sam' }).where(eq(people.email, 'sam@gmail.com'))
  return result.groupId
}

function renderGroup(groupId: string) {
  return renderPage(<GroupPage />, { path: ROUTES.group(groupId), pattern: ROUTES.groupPattern, routes: [ROUTES.home] })
}

describe('the balance line on the group page', () => {
  it('nets what the user is owed against what the user owes, so being owed overall is not also told what is owed', async () => {
    const groupId = await createGroup()
    const omkarId = await personIdOf(testDb.db, me.email)
    const priyaId = await personIdOf(testDb.db, 'priya@gmail.com')
    const samId = await personIdOf(testDb.db, 'sam@gmail.com')
    // Sam owes Omkar 10.00 and Omkar owes Priya 2.00: Omkar gets back 8.00 from Sam and nothing is said about Priya.
    await addTestExpense(testDb.db, me.email, groupId, { amountMinor: 1000, split: { method: 'exact', values: { [samId]: 1000 } } })
    await addTestExpense(testDb.db, 'priya@gmail.com', groupId, { amountMinor: 200, paidBy: priyaId, split: { method: 'exact', values: { [omkarId]: 200 } } })
    renderGroup(groupId)

    expect(await screen.findByText(/^Sam owes you/)).toHaveTextContent('Sam owes you £8.00')
    // One sentence only: nothing is said about Priya, whom the user owes 2.00 before simplifying.
    expect(screen.getAllByText(/ owes you/)).toHaveLength(1)
    expect(screen.queryByText(/^You owe/)).toBeNull()
  })

  it('says "You\'re all settled up" when the simplified payments leave nothing for the user', async () => {
    const groupId = await createGroup()
    const priyaId = await personIdOf(testDb.db, 'priya@gmail.com')
    const samId = await personIdOf(testDb.db, 'sam@gmail.com')
    // Sam owes Priya; the user is in the group but owes and is owed nothing.
    await addTestExpense(testDb.db, 'priya@gmail.com', groupId, { amountMinor: 500, paidBy: priyaId, split: { method: 'exact', values: { [samId]: 500 } } })
    renderGroup(groupId)

    expect(await screen.findByText("You're all settled up")).toBeInTheDocument()
  })
})
