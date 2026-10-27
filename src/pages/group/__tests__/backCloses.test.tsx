// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { slide } from '../../../hooks/useAppNavigate/utils.ts'
import { handleOverlayPop } from '../../../hooks/useCloseOnBack/overlays.ts'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { GroupPage } from '../index.tsx'

// The browser's Back button closes the members sheet and, stacked on it, "Add a member" (PRD 5.19).
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

const tick = () => new Promise((resolve) => setTimeout(resolve, 5))
const state = () => window.history.state as { overlay?: number } | null

async function back() {
  window.history.back()
  // jsdom moves the history a moment later; the overlay handler holds the event back from other listeners, so wait on time.
  await new Promise((resolve) => setTimeout(resolve, 30))
}

/** Whether the sheet with this title is closed (Ant Design keeps a closed one in the page, hidden). */
function isClosed(title: string) {
  const heading = [...document.querySelectorAll('.ant-drawer-title, .ant-modal-title')].find((element) => element.textContent === title)
  const panel = heading?.closest('.ant-drawer-content-wrapper, .ant-modal-wrap')
  return !panel || panel.classList.contains('ant-drawer-content-wrapper-hidden') || (panel as HTMLElement).style.display === 'none'
}

beforeEach(() => {
  useAuthStore.setState({ profile: me, guest: false, token: null })
  window.history.replaceState({ usr: null, key: 'page', idx: 0 }, '', '/')
  slide.key = 'page'
  window.addEventListener('popstate', handleOverlayPop)
})
afterEach(async () => {
  cleanup()
  await tick()
  window.removeEventListener('popstate', handleOverlayPop)
})

async function renderGroup() {
  const created = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
  if (!created.ok) throw new Error('group')
  renderPage(<GroupPage />, { path: ROUTES.group(created.groupId), pattern: ROUTES.groupPattern, routes: [ROUTES.home] })
}

const membersChip = () => screen.findByRole('button', { name: /(?<!\d)2 members$/ })

describe('the members sheet and the browser\'s Back button', () => {
  it('closes with Back, and the page stays', async () => {
    await renderGroup()
    await userEvent.click(await membersChip())
    await screen.findByText('Members (2)')
    expect(state()?.overlay).toBe(1)

    await act(async () => back())

    await waitFor(() => expect(isClosed('Members (2)')).toBe(true))
    expect(screen.getByRole('heading', { name: 'Goa trip' })).toBeInTheDocument()
    expect(state()?.overlay).toBeUndefined()
  })

  it('closes Add a member first and the members sheet second, one Back each', async () => {
    await renderGroup()
    await userEvent.click(await membersChip())
    await userEvent.click(await screen.findByRole('button', { name: /Add member$/ }))
    await screen.findByText('Add a member')
    expect(state()?.overlay).toBe(2)

    await act(async () => back())
    await waitFor(() => expect(isClosed('Add a member')).toBe(true))
    expect(isClosed('Members (2)')).toBe(false)
    expect(state()?.overlay).toBe(1)

    await act(async () => back())
    await waitFor(() => expect(isClosed('Members (2)')).toBe(true))
    expect(state()?.overlay).toBeUndefined()
  })

  it('gives its step back when closed with its own button, so Back still leaves the page', async () => {
    await renderGroup()
    await userEvent.click(await membersChip())
    await screen.findByText('Members (2)')

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await act(async () => {
      await tick()
      await tick()
    })

    expect(state()?.overlay).toBeUndefined()
  })
})
