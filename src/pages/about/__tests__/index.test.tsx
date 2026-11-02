// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { renderPage } from '../../../testing/render.tsx'
import { HEADER_TITLE_STYLE } from '../../../theme/headerTitle.ts'
import { HEADER_TOP_PADDING } from '../../../theme/safeArea.ts'
import { AboutPage } from '../index.tsx'

vi.mock('../../../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: false }))

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }

function renderAbout() {
  return renderPage(<AboutPage />, { path: ROUTES.about, routes: [ROUTES.home] })
}

describe('AboutPage', () => {
  beforeEach(() => useAuthStore.setState({ profile: me, guest: false, token: null }))
  afterEach(cleanup)

  it('has the tab title and a quiet About heading beside a Back button', () => {
    renderAbout()

    expect(document.title).toBe('About · OwnLedger')
    const heading = screen.getByRole('heading', { name: 'About' })
    expect(heading).toHaveStyle({ fontSize: HEADER_TITLE_STYLE.fontSize as string, textTransform: 'uppercase' })
    const back = screen.getByRole('button', { name: /^Back/ })
    expect(back.parentElement).toBe(heading.parentElement)
  })

  it('pads its header the same distance below the status bar as every other page', () => {
    renderAbout()

    const row = screen.getByRole('heading', { name: 'About' }).parentElement as HTMLElement
    expect(row.style.paddingTop).toBe(`calc(${HEADER_TOP_PADDING}px + env(safe-area-inset-top))`)
  })

  it('shows the app\'s version under its name, and above the tagline', () => {
    renderAbout()

    const name = screen.getByRole('heading', { level: 1, name: 'OwnLedger' })
    const version = screen.getByText('Version 0.0.0-test')
    const tagline = screen.getByRole('heading', { name: 'Split expenses with friends. Keep your data.' })
    expect(name.compareDocumentPosition(version) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(version.compareDocumentPosition(tagline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('tells what the app is, as the welcome page does', () => {
    renderAbout()

    expect(screen.getByText('Track your own spending and share costs with trips, homes and partners.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Everything you need to share costs' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Questions and answers' })).toBeInTheDocument()
    expect(screen.getByText('Do I need to sign in?')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Source code on GitHub' })).toBeInTheDocument()
  })

  it('leaves out the install card, the Open OwnLedger button and the sign-in note', () => {
    renderAbout()

    expect(screen.queryByText(/Install OwnLedger/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open OwnLedger' })).not.toBeInTheDocument()
    expect(screen.queryByText(/No account needed\. Sign in with Google/)).not.toBeInTheDocument()
  })

  it('goes back to the home page from the Back button', async () => {
    const page = renderAbout()

    await userEvent.click(screen.getByRole('button', { name: /^Back/ }))

    expect(page.currentPath()).toBe(ROUTES.home)
  })

  it('opens for a guest too', () => {
    useAuthStore.setState({ profile: null, guest: true })
    renderAbout()

    expect(screen.getByText('Version 0.0.0-test')).toBeInTheDocument()
  })
})
