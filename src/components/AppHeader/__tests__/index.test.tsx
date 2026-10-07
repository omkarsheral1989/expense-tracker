// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { renderPage } from '../../../testing/render.tsx'
import { AppHeader } from '../index.tsx'

const profile = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }

function renderHeader(path: string = ROUTES.newGroup) {
  return renderPage(<AppHeader />, { path, routes: [ROUTES.home] })
}

describe('AppHeader', () => {
  beforeEach(() => useAuthStore.setState({ profile, token: null }))
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
})
