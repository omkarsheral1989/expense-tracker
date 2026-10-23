// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { sharedFiles } from '../pwa/sharedFiles.ts'
import { ROUTES } from '../routes.ts'
import { useAuthStore } from '../stores/useAuthStore'
import { continueAsGuest, renderApp, setUpJourneyTests } from './helpers.tsx'

vi.mock('../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: false }))
vi.mock('@electric-sql/pglite', async (original) => (await import('../testing/memoryPglite.ts')).memoryPglite(await original()))

const device = setUpJourneyTests()

describe('getting into the app', () => {
  it('shows the welcome page to someone who is neither signed in nor a guest', async () => {
    const { currentPath } = renderApp(ROUTES.welcome)
    expect(await screen.findByText('Split expenses with friends. Keep your data.')).toBeInTheDocument()
    expect(currentPath()).toBe(ROUTES.welcome)
  })

  it.each([[ROUTES.home], [ROUTES.members], [ROUTES.newGroup], [ROUTES.share], ['/groups/abc/edit'], ['/nowhere/at/all']])(
    'sends a visitor of %s to the welcome page',
    async (path) => {
      const { currentPath } = renderApp(path)
      await waitFor(() => expect(currentPath()).toBe(ROUTES.welcome))
    },
  )

  it('drops a held share when a signed-out visitor is turned away (nothing is kept for them)', async () => {
    await sharedFiles.save({ pictures: [], notes: 'Dinner', leftOut: 0, sharedAt: Date.now() })
    const { currentPath } = renderApp(ROUTES.share)
    await waitFor(() => expect(currentPath()).toBe(ROUTES.welcome))
    await waitFor(async () => expect(await sharedFiles.read()).toBeNull())
  })

  it('opens a guest on their home page, with no groups yet', async () => {
    const { currentPath } = renderApp(ROUTES.getStarted)
    await continueAsGuest(device.user)
    expect(currentPath()).toBe(ROUTES.home)
    expect(await screen.findByText(/No groups yet/)).toBeInTheDocument()
  })

  it('takes a guest who is already in straight from the get-started page to home', async () => {
    useAuthStore.setState({ guest: true })
    const { currentPath } = renderApp(ROUTES.getStarted)
    await waitFor(() => expect(currentPath()).toBe(ROUTES.home))
  })

  it('takes a signed-in user from the welcome page to home', async () => {
    useAuthStore.setState({ profile: { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' } })
    const { currentPath } = renderApp(ROUTES.welcome)
    await waitFor(() => expect(currentPath()).toBe(ROUTES.home))
    expect(await screen.findByRole('heading', { name: 'Your groups' }, { timeout: 20_000 })).toBeInTheDocument()
  })
})
