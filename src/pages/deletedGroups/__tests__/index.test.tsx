// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '../../../routes.ts'
import { groupDeletionService } from '../../../services/groupDeletionService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { DeletedGroupsPage } from '../index.tsx'

vi.mock('../../../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: true }))
vi.mock('../../../features.ts', () => ({ DELETE_GROUP_ENABLED: true }))
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

const render = () => renderPage(<DeletedGroupsPage />, { path: ROUTES.deletedGroups, routes: [ROUTES.home], extra: [{ path: '/groups/:id', element: <div>Group page</div> }] })

describe('the Deleted groups page', () => {
  it('says there is nothing when no group is deleted', async () => {
    render()
    expect(await screen.findByText('No deleted groups')).toBeInTheDocument()
    expect(screen.getByText('Groups you delete appear here.')).toBeInTheDocument()
  })

  it('lists the groups deleted here, newest deletion first, and opens one', async () => {
    const first = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: [] })
    const second = await createTestGroup(testDb.db, me, { name: 'Flat bills', type: 'home', defaultCurrency: 'GBP', memberEmails: [] })
    await createTestGroup(testDb.db, me, { name: 'Still here', type: 'other', defaultCurrency: 'GBP', memberEmails: [] })
    if (!first.ok || !second.ok) throw new Error('group')
    const userId = await personIdOf(testDb.db, me.email)
    await groupDeletionService.deleteGroup(testDb.db, userId, first.groupId)
    await new Promise((resolve) => setTimeout(resolve, 10))
    await groupDeletionService.deleteGroup(testDb.db, userId, second.groupId)

    const page = render()
    const list = await screen.findByRole('list', { name: 'Deleted groups' })
    const names = within(list).getAllByRole('link').map((link) => link.textContent ?? '')
    expect(names).toHaveLength(2)
    expect(names[0]).toContain('Flat bills')
    expect(names[1]).toContain('Goa trip')
    expect(screen.queryByText('Still here')).not.toBeInTheDocument()
    expect(screen.getAllByText(/^Deleted \d/)).toHaveLength(2)

    await userEvent.click(within(list).getAllByRole('link')[0])
    await waitFor(() => expect(page.currentPath()).toBe(`/groups/${second.groupId}`))
  })

  it('has a Back button to the home page', async () => {
    const page = render()
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }))
    expect(page.currentPath()).toBe(ROUTES.home)
  })
})
