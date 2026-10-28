// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { GroupPage } from '../index.tsx'

// In a group of one the rows show amounts, in a group of several what you lent or borrowed (PRD 5.5).
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

async function setUp(memberEmails: string[]) {
  const group = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails })
  if (!group.ok) throw new Error('group')
  await addTestExpense(testDb.db, me.email, group.groupId, { description: 'Dinner', amountMinor: 5500 })
  renderPage(<GroupPage />, { path: ROUTES.group(group.groupId), pattern: ROUTES.groupPattern, routes: [ROUTES.home] })
  return within((await screen.findByText('Dinner')).closest('a') as HTMLElement)
}

describe('the expense rows of the group page', () => {
  it('show the amount, not a balance, when you are the only member', async () => {
    const row = await setUp([])

    expect(row.getAllByText('£55.00').some((one) => one.tagName === 'STRONG')).toBe(true)
    expect(row.queryByText(/no balance|you lent|you borrowed|not involved/)).not.toBeInTheDocument()
  })

  it('show what you lent when the group has other members', async () => {
    const row = await setUp(['priya@gmail.com'])

    expect(row.getByText('you lent')).toBeInTheDocument()
    expect(row.getByText('£27.50')).toBeInTheDocument()
  })
})
