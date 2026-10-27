// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '../../../routes.ts'
import { expenseService } from '../../../services/expenseService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense, addTestSettlement, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { GroupPage } from '../index.tsx'

// The Totals pill is on only when the group has an expense that counts (PRD 5.20).
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

async function createGroup(memberEmails: string[] = ['priya@gmail.com']) {
  const result = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails })
  if (!result.ok) throw new Error('group')
  return result.groupId
}

function renderGroup(groupId: string) {
  return renderPage(<GroupPage />, { path: ROUTES.group(groupId), pattern: ROUTES.groupPattern, routes: [ROUTES.totalsPattern, ROUTES.home] })
}

const totals = () => screen.findByRole('button', { name: /Totals$/ })

describe('the Totals pill on the group page', () => {
  it('is on once the group has an expense, and opens the totals page', async () => {
    const groupId = await createGroup()
    await addTestExpense(testDb.db, me.email, groupId)
    const page = renderGroup(groupId)

    const pill = await totals()
    expect(pill).toBeEnabled()
    await userEvent.click(pill)

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.totals(groupId)))
  })

  it('is switched off in a group with no expenses', async () => {
    renderGroup(await createGroup())

    expect(await totals()).toBeDisabled()
  })

  it('is switched off when there are only payments between members', async () => {
    const groupId = await createGroup()
    await addTestSettlement(testDb.db, 'priya@gmail.com', me.email, groupId)
    renderGroup(groupId)

    expect(await totals()).toBeDisabled()
  })

  it('is switched off when the only expense was deleted', async () => {
    const groupId = await createGroup()
    const expenseId = await addTestExpense(testDb.db, me.email, groupId)
    await expenseService.deleteExpense(testDb.db, await personIdOf(testDb.db, me.email), groupId, expenseId)
    renderGroup(groupId)

    expect(await totals()).toBeDisabled()
  })

  it('is on in a group of one, where Settle up is off', async () => {
    const groupId = await createGroup([])
    await addTestExpense(testDb.db, me.email, groupId)
    renderGroup(groupId)

    expect(await totals()).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Settle up' })).toBeDisabled()
  })
})
