// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '../../../routes.ts'
import { groupDeletionService } from '../../../services/groupDeletionService'
import { groupService } from '../../../services/groupService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { GroupPage } from '../index.tsx'

// Deleting a group, on the group page (PRD 5.22) and the read-only page of a deleted one (PRD 5.23).
const flag = vi.hoisted(() => ({ on: true }))
vi.mock('../../../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: true }))
vi.mock('../../../features.ts', () => ({
  get DELETE_GROUP_ENABLED() {
    return flag.on
  },
}))
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

/** Matches a button by the end of its name (Ant Design puts an icon's name in front of its text). */
const named = (text: string) => new RegExp(`${text}$`)

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const testDb = setUpTestDatabase()

beforeEach(() => {
  flag.on = true
  useAuthStore.setState({ profile: me, guest: false, token: null })
})
afterEach(cleanup)

async function renderGroup() {
  const created = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
  if (!created.ok) throw new Error('group')
  const userId = await personIdOf(testDb.db, me.email)
  const page = renderPage(<GroupPage />, { path: ROUTES.group(created.groupId), pattern: ROUTES.groupPattern, routes: [ROUTES.home] })
  return { groupId: created.groupId, userId, page }
}

/** Opens the band's three-dots menu and returns its entry with this label (null while the menu has none). */
async function menuEntry(label: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'More options' }))
  const menu = await screen.findByRole('menu')
  return within(menu).queryByRole('menuitem', { name: new RegExp(label) })
}

describe('Delete group entry of the three-dots menu', () => {
  it('is on the band when the feature is on', async () => {
    await renderGroup()
    expect(await menuEntry('Delete group')).toBeInTheDocument()
  })

  it('is not there when the feature is off', async () => {
    flag.on = false
    await renderGroup()
    expect(await menuEntry('Edit group')).toBeInTheDocument()
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: /Delete group/ })).not.toBeInTheDocument()
  })
})

describe('deleting a settled group', () => {
  it('asks first, and Cancel changes nothing', async () => {
    const { groupId, userId } = await renderGroup()
    await userEvent.click((await menuEntry('Delete group'))!)
    const dialog = await screen.findByRole('dialog')
    expect((await screen.findAllByText('Delete this group?')).length).toBeGreaterThan(0)
    expect(within(dialog).getByText(/hidden on this device only/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect((await groupService.listGroups(testDb.db, userId)).map((group) => group.id)).toEqual([groupId])
  })

  it('Delete hides it on this device and goes to the home page', async () => {
    const { groupId, userId, page } = await renderGroup()
    await userEvent.click((await menuEntry('Delete group'))!)
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.home))
    expect(await groupService.listGroups(testDb.db, userId)).toEqual([])
    expect((await groupService.listGroups(testDb.db, userId, 'deleted')).map((group) => group.id)).toEqual([groupId])
  })
})

describe('an unsettled group', () => {
  it('lists who still owes whom and offers Open balances instead of deleting', async () => {
    const { groupId, userId } = await renderGroup()
    await addTestExpense(testDb.db, me.email, groupId)
    await userEvent.click((await menuEntry('Delete group'))!)
    const dialog = await screen.findByRole('dialog')
    expect((await screen.findAllByText("This group isn't settled up yet")).length).toBeGreaterThan(0)
    expect(within(dialog).getByText(/Priya owes £5\.00 to you/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Open balances' })).toBeInTheDocument()
    expect(await groupService.listGroups(testDb.db, userId)).toHaveLength(1)
  })
})

describe('a deleted group', () => {
  async function renderDeleted() {
    const { groupId, userId } = await renderGroup()
    await groupDeletionService.deleteGroup(testDb.db, userId, groupId)
    cleanup()
    renderPage(<GroupPage />, { path: ROUTES.group(groupId), pattern: ROUTES.groupPattern, routes: [ROUTES.home] })
    return { groupId, userId }
  }

  it('opens read-only: Restore instead of Edit and Delete, no Add expense, Settle up off', async () => {
    await renderDeleted()
    expect(await menuEntry('Restore group')).toBeInTheDocument()
    expect(screen.getByText(/You deleted this group on/)).toBeInTheDocument()
    const menu = within(screen.getByRole('menu'))
    expect(menu.queryByRole('menuitem', { name: /Edit group/ })).not.toBeInTheDocument()
    expect(menu.queryByRole('menuitem', { name: /Delete group/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: named('Add expense') })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: named('Settle up') })).toBeDisabled()
  })

  it('stays read-only when the feature is turned off', async () => {
    flag.on = false
    await renderDeleted()
    expect(await menuEntry('Restore group')).toBeInTheDocument()
  })

  it('Restore brings it back on the list', async () => {
    const { userId } = await renderDeleted()
    await userEvent.click((await menuEntry('Restore group'))!)
    expect(await menuEntry('Edit group')).toBeInTheDocument()
    expect((await groupService.listGroups(testDb.db, userId)).map((group) => group.name)).toEqual(['Goa trip'])
  })
})
