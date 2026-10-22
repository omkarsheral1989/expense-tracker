// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { renderPage } from '../../../testing/render.tsx'
import { AppHeader } from '../index.tsx'

// The tests do not depend on this machine's .env.local: no client id, so Sign in with Google explains it is not set up.
vi.mock('../../../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: true }))

const profile = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }

function renderHeader(path: string = ROUTES.newGroup) {
  return renderPage(<AppHeader />, { path, routes: [ROUTES.home, ROUTES.members] })
}

describe('AppHeader', () => {
  beforeEach(() => useAuthStore.setState({ profile, guest: false, token: null }))
  afterEach(cleanup)

  it('shows the OwnLedger name as a link to the home page', async () => {
    const page = renderHeader(ROUTES.newGroup)

    const brand = screen.getByRole('link', { name: /ownledger/i })
    expect(brand).toHaveAttribute('href', ROUTES.home)

    await userEvent.click(brand)
    expect(page.currentPath()).toBe(ROUTES.home)
  })

  it('shows the user\'s initial when they have no picture', () => {
    renderHeader()
    const button = screen.getByRole('button', { name: 'Account menu' })
    expect(within(button).getByText('O')).toBeInTheDocument()
  })

  it('shows the user\'s Google picture when they have one', () => {
    useAuthStore.setState({ profile: { ...profile, picture: 'https://example.com/me.png' } })
    renderHeader()

    const image = screen.getByRole('button', { name: 'Account menu' }).querySelector('img')
    expect(image).toHaveAttribute('src', 'https://example.com/me.png')
    // Google pictures only load without a referrer.
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('opens a menu with the name, the email and Sign out', async () => {
    renderHeader()
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    expect(await screen.findByText('Omkar Sheral')).toBeInTheDocument()
    expect(screen.getByText('omkar@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('Sign out')).toBeInTheDocument()
  })

  it('lists Group members above Sign out and opens the members page', async () => {
    const page = renderHeader()
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Omkar Sheral' + 'omkar@gmail.com',
      expect.stringMatching(/Group members$/),
      expect.stringMatching(/Sign out$/),
    ])

    await userEvent.click(within(menu).getByText('Group members'))
    expect(page.currentPath()).toBe(ROUTES.members)
  })

  it('signs the user out from the menu', async () => {
    renderHeader()
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    await userEvent.click(await screen.findByText('Sign out'))

    expect(useAuthStore.getState().profile).toBeNull()
  })

  it('shows nothing when nobody is signed in', () => {
    useAuthStore.setState({ profile: null })
    renderHeader()
    expect(screen.queryByRole('link', { name: /ownledger/i })).not.toBeInTheDocument()
  })

  describe('for a guest', () => {
    beforeEach(() => useAuthStore.setState({ profile: null, guest: true }))

    it('shows a plain G for the avatar', () => {
      renderHeader()
      const button = screen.getByRole('button', { name: 'Account menu' })
      expect(within(button).getByText('G')).toBeInTheDocument()
      expect(button.querySelector('img')).toBeNull()
    })

    it('opens a menu with "Guest", that the data is only on this device, Sign in with Google and Exit guest mode', async () => {
      renderHeader()

      await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

      const menu = await screen.findByRole('menu')
      expect(within(menu).getByText('Guest')).toBeInTheDocument()
      expect(within(menu).getByText('Your data is only on this device')).toBeInTheDocument()
      expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'Guest' + 'Your data is only on this device',
        expect.stringMatching(/Group members$/),
        expect.stringMatching(/Sign in with Google$/),
        expect.stringMatching(/Exit guest mode$/),
      ])
      expect(within(menu).queryByText('Sign out')).not.toBeInTheDocument()
    })

    it('opens the members page from the menu', async () => {
      const page = renderHeader()
      await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

      await userEvent.click(await screen.findByText('Group members'))

      expect(page.currentPath()).toBe(ROUTES.members)
    })

    it('starts the Google sign-in from the menu (here it explains that it is not set up)', async () => {
      renderHeader()
      await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

      await userEvent.click(await screen.findByText('Sign in with Google'))

      expect(await screen.findByText(/Google sign-in is not configured yet/)).toBeInTheDocument()
      expect(useAuthStore.getState().guest).toBe(true)
    })

    it('exits guest mode from the menu, keeping nothing signed in', async () => {
      renderHeader()
      await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

      await userEvent.click(await screen.findByText('Exit guest mode'))

      expect(useAuthStore.getState()).toMatchObject({ guest: false, profile: null })
    })

    it('still links the name to the home page', () => {
      renderHeader()
      expect(screen.getByRole('link', { name: /ownledger/i })).toHaveAttribute('href', ROUTES.home)
    })
  })

  it('shows nothing when nobody is signed in and nobody is a guest', () => {
    useAuthStore.setState({ profile: null, guest: false })
    renderHeader()
    expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument()
  })
})
