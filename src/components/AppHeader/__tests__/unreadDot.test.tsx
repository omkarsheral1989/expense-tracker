// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activityService } from '../../../services/activityService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { useSyncStore } from '../../../stores/useSyncStore'
import { renderPage } from '../../../testing/render.tsx'
import { AppHeader } from '../index.tsx'

// The tests do not depend on this machine's .env.local.
vi.mock('../../../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: true }))
// The dot reads the database through `getDb`; here it just answers.
vi.mock('../../../db/client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../db/client.ts')>()),
  getDb: vi.fn(async () => ({})),
}))

const profile = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }

function unread(hasUnread: boolean) {
  return vi.spyOn(activityService, 'unreadState').mockResolvedValue({ seenAt: null, hasUnread })
}

const dots = (root: ParentNode = document) => root.querySelectorAll('[data-testid="unread-dot"]')

beforeEach(() => useAuthStore.setState({ profile, guest: false, token: null }))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the unread dot of the avatar menu (PRD 5.18)', () => {
  it('shows on the avatar and beside the Activity entry while something is new', async () => {
    unread(true)
    renderPage(<AppHeader />)

    const avatar = screen.getByRole('button', { name: 'Account menu' })
    await waitFor(() => expect(dots()).toHaveLength(1))
    // On the avatar's top-right corner, ringed in the header's green.
    const dot = dots()[0] as HTMLElement
    expect(avatar.parentElement).toContainElement(dot)
    expect(dot).toHaveStyle({ position: 'absolute', top: '0px', right: '0px', width: '8px', height: '8px', background: '#fa541c' })
    expect(dot.style.boxShadow).toContain('#0d9488')

    await userEvent.click(avatar)
    const entry = within(await screen.findByRole('menu')).getByText('Activity')
    expect(dots(entry.parentElement!)).toHaveLength(1)
    // The entry's dot is to the left of its text.
    expect(entry.firstElementChild).toHaveAttribute('data-testid', 'unread-dot')
  })

  it('does not show when nothing is new', async () => {
    const spy = unread(false)
    renderPage(<AppHeader />)
    await waitFor(() => expect(spy).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await screen.findByRole('menu')

    expect(dots()).toHaveLength(0)
  })

  it('shows for a guest too', async () => {
    useAuthStore.setState({ profile: null, guest: true })
    unread(true)
    renderPage(<AppHeader />)

    await waitFor(() => expect(dots()).toHaveLength(1))
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(dots(await screen.findByRole('menu'))).toHaveLength(1)
  })

  it('is read again after a sync, which may bring in changes', async () => {
    const spy = unread(false)
    renderPage(<AppHeader />)
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    expect(dots()).toHaveLength(0)

    spy.mockResolvedValue({ seenAt: null, hasUnread: true })
    useSyncStore.getState().finish()

    await waitFor(() => expect(dots()).toHaveLength(1))
  })

  it('never makes the dot something screen readers announce', async () => {
    unread(true)
    renderPage(<AppHeader />)

    await waitFor(() => expect(dots()).toHaveLength(1))
    expect(dots()[0]).toHaveAttribute('aria-hidden', 'true')
  })
})
