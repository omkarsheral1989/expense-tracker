// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deviceService } from '../../../services/deviceService'
import { googleProfileService } from '../../../services/googleProfileService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { renderPage } from '../../../testing/render.tsx'
import { useSignIn } from '../index.ts'

type LoginOptions = {
  onSuccess: (response: { access_token: string; expires_in: number }) => Promise<void>
  onError: () => void
  onNonOAuthError: (error: { type: string }) => void
}

// Google's own login needs its script and a popup; here it is pressed by the test.
const google = vi.hoisted(() => ({ options: null as unknown }))
vi.mock('@react-oauth/google', () => ({
  useGoogleLogin: vi.fn((options: unknown) => {
    google.options = options
    return () => {}
  }),
}))
vi.mock('../../../services/googleProfileService', () => ({
  googleProfileService: { fetchProfile: vi.fn() },
}))

const omkar = { id: 'g-omkar', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const priya = { id: 'g-priya', email: 'priya@gmail.com', name: 'Priya' }

const options = () => google.options as LoginOptions

function SignInButton() {
  const { signIn, loading } = useSignIn()
  return (
    <button onClick={signIn}>{loading ? 'Signing in…' : 'Sign in'}</button>
  )
}

/** What Google does when the user finishes signing in: gives the app a token. */
async function googleSignsIn(profile: typeof omkar) {
  vi.mocked(googleProfileService.fetchProfile).mockResolvedValue(profile)
  await options().onSuccess({ access_token: 'token', expires_in: 3600 })
}

describe('useSignIn', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    localStorage.clear()
    useAuthStore.setState({ profile: null, guest: false, token: null })
    ;(window as unknown as { google: unknown }).google = { accounts: {} }
    renderPage(<SignInButton />)
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    delete (window as unknown as { google?: unknown }).google
  })

  it('signs in with the account Google gives, and makes it the owner of the data on this device', async () => {
    await googleSignsIn(omkar)

    await waitFor(() => expect(useAuthStore.getState().profile).toEqual(omkar))
    expect(useAuthStore.getState().token).toMatchObject({ value: 'token' })
    expect(deviceService.read()?.owner).toEqual({ accountId: 'g-omkar', email: 'omkar@gmail.com' })
  })

  it('ends guest mode when a guest signs in', async () => {
    useAuthStore.setState({ guest: true })
    deviceService.forGuest()

    await googleSignsIn(omkar)

    await waitFor(() => expect(useAuthStore.getState()).toMatchObject({ guest: false, profile: omkar }))
    expect(deviceService.read()?.owner?.accountId).toBe('g-omkar')
  })

  it('refuses another Google account, says whose device it is, and signs nobody in', async () => {
    deviceService.forGoogle(omkar)

    await googleSignsIn(priya)

    const dialog = await screen.findByRole('dialog', { name: 'This device is already used by another account' })
    expect(
      within(dialog).getByText("This device's data belongs to omkar@gmail.com. Sign in with that account, or clear the app's data to use another."),
    ).toBeInTheDocument()
    expect(useAuthStore.getState().profile).toBeNull()
    expect(deviceService.read()?.owner?.accountId).toBe('g-omkar')
  })

  it('lets the owner sign in again', async () => {
    deviceService.forGoogle(omkar)

    await googleSignsIn(omkar)

    await waitFor(() => expect(useAuthStore.getState().profile).toEqual(omkar))
  })

  it('says so when the Google profile cannot be read, and signs nobody in', async () => {
    vi.mocked(googleProfileService.fetchProfile).mockRejectedValue(new Error('offline'))

    await options().onSuccess({ access_token: 'token', expires_in: 3600 })

    expect(await screen.findByText("Couldn't read your Google profile. Please try again.")).toBeInTheDocument()
    expect(useAuthStore.getState().profile).toBeNull()
    expect(deviceService.read()).toBeNull()
  })

  it('says Google did not allow it when Google reports an error', async () => {
    options().onError()
    expect(await screen.findByText(/Google didn't allow the sign-in/)).toBeInTheDocument()
  })

  it('says the sign-in window was blocked, but nothing when the user just closed it', async () => {
    options().onNonOAuthError({ type: 'popup_closed' })
    expect(screen.queryByText(/sign-in window was blocked/)).not.toBeInTheDocument()

    options().onNonOAuthError({ type: 'popup_failed_to_open' })
    expect(await screen.findByText('The sign-in window was blocked. Allow pop-ups and try again.')).toBeInTheDocument()
  })

  it('asks for a connection when it is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Sign-in needs an internet connection. Check it and try again.')).toBeInTheDocument()
  })

  it('asks for a connection when Google\'s script has not loaded', async () => {
    delete (window as unknown as { google?: unknown }).google

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Sign-in needs an internet connection. Check it and try again.')).toBeInTheDocument()
  })
})
