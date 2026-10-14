// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInstallGate } from '../../../hooks/useInstallGate'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { renderPage } from '../../../testing/render.tsx'
import { GetStartedPage } from '../index.tsx'

// The tests do not depend on this machine's .env.local: no client id, so sign-in explains it is not set up.
vi.mock('../../../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: true }))
// Whether the page is locked behind installing the app is tested with the hook.
vi.mock('../../../hooks/useInstallGate', () => ({ useInstallGate: vi.fn() }))

const profile = { id: '1', email: 'omkar@gmail.com', name: 'Omkar' }

function setGated(gated: boolean) {
  vi.mocked(useInstallGate).mockReturnValue({ gated } as ReturnType<typeof useInstallGate>)
}

function renderIt() {
  return renderPage(<GetStartedPage />, { path: ROUTES.getStarted, routes: [ROUTES.home, ROUTES.welcome] })
}

describe('the Open OwnLedger page', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    localStorage.clear()
    useAuthStore.setState({ profile: null, guest: false, token: null })
    setGated(false)
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('offers Sign in with Google, OR, and Continue as a guest, in that order, with the reason for signing in', () => {
    renderIt()

    expect(screen.getByRole('heading', { name: 'Open OwnLedger' })).toBeInTheDocument()
    const signIn = screen.getByRole('button', { name: /Sign in with Google/ })
    const guest = screen.getByRole('button', { name: 'Continue as a guest' })
    const or = screen.getByText('OR')
    expect(signIn.compareDocumentPosition(or) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(or.compareDocumentPosition(guest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      screen.getByText('Google sign-in is required to back up your data and share groups with others.'),
    ).toBeInTheDocument()
  })

  it('has the tab title "Open OwnLedger"', async () => {
    renderIt()
    await waitFor(() => expect(document.title).toBe('Open OwnLedger'))
  })

  it('goes back to the welcome page with Back', async () => {
    const page = renderIt()
    await user.click(screen.getByRole('link', { name: /Back/ }))
    expect(page.currentPath()).toBe(ROUTES.welcome)
  })

  it('continues as a guest: the session is a guest, and the app opens on the home page', async () => {
    const page = renderIt()

    await user.click(screen.getByRole('button', { name: 'Continue as a guest' }))

    expect(useAuthStore.getState()).toMatchObject({ guest: true, profile: null })
    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.home))
  })

  it('explains that sign-in is not set up when there is no Google client id', async () => {
    renderIt()

    await user.click(screen.getByRole('button', { name: /Sign in with Google/ }))

    expect(await screen.findByText(/Google sign-in is not configured yet/)).toBeInTheDocument()
    expect(useAuthStore.getState().profile).toBeNull()
  })

  it('takes someone who is signed in straight to the home page', () => {
    useAuthStore.setState({ profile })
    const page = renderIt()
    expect(page.currentPath()).toBe(ROUTES.home)
    expect(screen.queryByRole('button', { name: 'Continue as a guest' })).not.toBeInTheDocument()
  })

  it('takes a guest straight to the home page', () => {
    useAuthStore.setState({ guest: true })
    const page = renderIt()
    expect(page.currentPath()).toBe(ROUTES.home)
  })

  it('sends the visitor back to the welcome page while installing is required first (iPhone and iPad)', () => {
    setGated(true)
    const page = renderIt()
    expect(page.currentPath()).toBe(ROUTES.welcome)
    expect(screen.queryByRole('button', { name: 'Continue as a guest' })).not.toBeInTheDocument()
  })
})
