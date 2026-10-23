// @vitest-environment jsdom
// A picture and text shared from another app land in Add expense (PRD 5.11).
import 'fake-indexeddb/auto'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { sharedFiles } from '../pwa/sharedFiles.ts'
import { ROUTES } from '../routes.ts'
import { continueAsGuest, createGroupWithFriend, OPENING, renderApp, reopenApp, setUpJourneyTests } from './helpers.tsx'

vi.mock('../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: false }))
vi.mock('@electric-sql/pglite', async (original) => (await import('../testing/memoryPglite.ts')).memoryPglite(await original()))

const device = setUpJourneyTests()

describe('sharing a receipt into the app', () => {
  it('opens Add expense for the latest group with the shared picture and text, and saves it', async () => {
    const { user } = device
    renderApp(ROUTES.getStarted)
    await continueAsGuest(user)
    await createGroupWithFriend(user, 'Goa trip', { name: 'Priya Shah', email: 'priya@gmail.com' })
    await screen.findByText('Goa trip', {}, OPENING)

    // Another app shares a picture and some text; the service worker has stored them.
    await sharedFiles.save({
      pictures: [{ name: 'receipt.png', type: 'image/png', bytes: new Uint8Array([1, 2, 3]).buffer }],
      notes: 'Beach shack\nhttps://example.test/bill',
      leftOut: 0,
      sharedAt: Date.now(),
    })
    const { currentPath } = await reopenApp(ROUTES.share)

    expect(await screen.findByRole('heading', { name: 'Add expense' }, OPENING)).toBeInTheDocument()
    expect(currentPath()).toMatch(/\/groups\/.+\/expenses\/new$/)
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('Beach shack\nhttps://example.test/bill')
    expect(screen.getByRole('button', { name: 'Remove receipt photo 1' })).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Shack')
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '30')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Expense added.')).toBeInTheDocument()
    expect(await screen.findByText('Shack')).toBeInTheDocument()
    // The held share is gone once it has been used.
    expect(await sharedFiles.read()).toBeNull()
  })

  it('goes home with a message when the user has no group to add the receipt to', async () => {
    const { user } = device
    renderApp(ROUTES.getStarted)
    await continueAsGuest(user)
    await sharedFiles.save({
      pictures: [{ name: 'receipt.png', type: 'image/png', bytes: new Uint8Array([1]).buffer }],
      notes: '',
      leftOut: 0,
      sharedAt: Date.now(),
    })

    const { currentPath } = await reopenApp(ROUTES.share)

    expect(await screen.findByText('Create a group first to add a shared receipt.', {}, OPENING)).toBeInTheDocument()
    await waitFor(() => expect(currentPath()).toBe(ROUTES.home))
    expect(await sharedFiles.read()).toBeNull()
  })
})
