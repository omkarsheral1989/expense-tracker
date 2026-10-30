// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { renderPage } from '../../../testing/render.tsx'
import { AppHeader } from '../index.tsx'

// The "Deleted groups" entry of the avatar menu is there whatever the flag says: it only hides the Delete button (PRD 5.1a, 5.22).
const flag = vi.hoisted(() => ({ on: true }))
vi.mock('../../../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: true }))
vi.mock('../../../features.ts', () => ({
  get DELETE_GROUP_ENABLED() {
    return flag.on
  },
}))

const profile = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }

function renderHeader() {
  return renderPage(<AppHeader />, { path: ROUTES.newGroup, routes: [ROUTES.home, ROUTES.deletedGroups] })
}

describe('the Deleted groups menu entry', () => {
  beforeEach(() => {
    flag.on = true
    useAuthStore.setState({ profile, guest: false, token: null })
  })
  afterEach(cleanup)

  it('opens the Deleted groups page, below Accounts', async () => {
    const page = renderHeader()
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    const menu = await screen.findByRole('menu')
    const labels = within(menu).getAllByRole('menuitem').map((item) => item.textContent ?? '')
    expect(labels.findIndex((label) => label.endsWith('Deleted groups'))).toBeGreaterThan(labels.findIndex((label) => label.endsWith('Accounts')))

    await userEvent.click(within(menu).getByText('Deleted groups'))
    expect(page.currentPath()).toBe(ROUTES.deletedGroups)
  })

  it('is still in the menu when the feature is off', async () => {
    flag.on = false
    renderHeader()
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(await within(await screen.findByRole('menu')).findByText('Deleted groups')).toBeInTheDocument()
  })
})
