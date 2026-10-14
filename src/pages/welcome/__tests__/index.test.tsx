// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInstallGate } from '../../../hooks/useInstallGate'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { renderPage } from '../../../testing/render.tsx'
import { WelcomePage } from '../index.tsx'

// Whether getting started is locked behind installing the app is tested with the hook.
vi.mock('../../../hooks/useInstallGate', () => ({ useInstallGate: vi.fn() }))

const profile = { id: '1', email: 'omkar@gmail.com', name: 'Omkar' }

function setInstall(state: Partial<ReturnType<typeof useInstallGate>> = {}) {
  vi.mocked(useInstallGate).mockReturnValue({
    platform: 'desktop',
    installed: false,
    canPrompt: false,
    promptInstall: vi.fn(),
    skipped: false,
    skipInstall: vi.fn(),
    gated: false,
    ...state,
  })
}

function renderIt() {
  return renderPage(<WelcomePage />, { path: ROUTES.welcome, routes: [ROUTES.home, ROUTES.getStarted] })
}

describe('WelcomePage', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    useAuthStore.setState({ profile: null, guest: false, token: null })
    setInstall()
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('has one button, Open OwnLedger, instead of Sign in with Google', () => {
    renderIt()

    expect(screen.getByRole('button', { name: 'Open OwnLedger' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sign in with Google/ })).not.toBeInTheDocument()
  })

  it('says no account is needed, and what signing in with Google is for', () => {
    renderIt()

    expect(
      screen.getByText(/No account needed\. Sign in with Google to back up and share your groups through your Google Drive\. Nothing is sent to our servers\./),
    ).toBeInTheDocument()
  })

  it('opens the page with Sign in with Google and Continue as a guest', async () => {
    const page = renderIt()

    await user.click(screen.getByRole('button', { name: 'Open OwnLedger' }))

    expect(page.currentPath()).toBe(ROUTES.getStarted)
  })

  it('answers "Do I need to sign in?" and what happens to guest data when signing in', () => {
    renderIt()

    expect(screen.getByText('Do I need to sign in?')).toBeInTheDocument()
    expect(screen.getByText('What happens to my data when I sign in later?')).toBeInTheDocument()
    expect(screen.getByText('Open OwnLedger', { selector: '.ant-steps-item-title' })).toBeInTheDocument()
  })

  it('takes someone who is signed in, or a guest, straight to the app', () => {
    useAuthStore.setState({ profile })
    expect(renderIt().currentPath()).toBe(ROUTES.home)
    cleanup()

    useAuthStore.setState({ profile: null, guest: true })
    expect(renderIt().currentPath()).toBe(ROUTES.home)
  })

  describe('on iPhone and iPad, before the app is installed', () => {
    it('shows the install card instead of the button, until the visitor chooses to continue in the browser', async () => {
      const skipInstall = vi.fn()
      setInstall({ platform: 'ios', gated: true, skipInstall })
      renderIt()

      expect(screen.getByText('Install OwnLedger first')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Open OwnLedger' })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Continue in browser anyway' }))
      expect(skipInstall).toHaveBeenCalled()
    })

    it('shows the button again once the visitor continued in the browser', () => {
      setInstall({ platform: 'ios', gated: false, skipped: true })
      renderIt()

      expect(screen.getByRole('button', { name: 'Open OwnLedger' })).toBeInTheDocument()
      expect(screen.queryByText('Install OwnLedger first')).not.toBeInTheDocument()
    })
  })

  it('shows the button next to an optional install card on Android and desktop', () => {
    setInstall({ platform: 'android' })
    renderIt()

    expect(screen.getByText('Install OwnLedger')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open OwnLedger' })).toBeInTheDocument()
  })

  it('shows no install card once the app is installed', () => {
    setInstall({ installed: true })
    renderIt()

    expect(screen.queryByText(/Install OwnLedger/)).not.toBeInTheDocument()
    expect(within(document.body).getByRole('button', { name: 'Open OwnLedger' })).toBeInTheDocument()
  })
})
