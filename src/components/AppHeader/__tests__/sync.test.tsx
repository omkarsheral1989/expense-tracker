// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groups } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { backupService } from '../../../services/backupService'
import { DRIVE_SCOPE } from '../../../services/driveService/constants.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { useSyncStore } from '../../../stores/useSyncStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { createFakeDrive } from '../../../testing/fakeDrive.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { SyncDialog } from '../../SyncDialog'
import { AppHeader } from '../index.tsx'

const fake = vi.hoisted(() => ({
  clientId: 'test-client-id',
  drive: null as ReturnType<typeof import('../../../testing/fakeDrive.ts').createFakeDrive> | null,
  /** The Google account Google's window hands back. */
  accountId: '1',
}))

vi.mock('../../../config.ts', () => ({
  get GOOGLE_CLIENT_ID() {
    return fake.clientId
  },
  REQUIRE_INSTALL: true,
}))

vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

// Drive calls go to the in-memory Drive of the test.
vi.mock('../../../services/driveService', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../services/driveService')>()
  return { ...original, driveService: { client: () => fake.drive!.client } }
})

// Whose Drive token it is: the account Google's window picked.
vi.mock('../../../services/googleProfileService', () => ({
  googleProfileService: {
    fetchProfile: vi.fn(async () => ({ id: fake.accountId, email: 'someone@gmail.com', name: 'Someone' })),
  },
}))

const profile = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const testDb = setUpTestDatabase()

/** Google's script: its window answers with `response` (a Drive token by default). */
function stubGoogle(response: Record<string, unknown> = { access_token: 'drive-token', expires_in: 3600 }) {
  const initTokenClient = vi.fn((config: { callback: (response: unknown) => void }) => ({
    requestAccessToken: () => config.callback(response),
  }))
  vi.stubGlobal('google', {
    accounts: { oauth2: { initTokenClient, hasGrantedAllScopes: () => Boolean(response.access_token) } },
  })
  return initTokenClient
}

function renderHeader() {
  return renderPage(
    <>
      <AppHeader />
      <SyncDialog />
    </>,
    { path: ROUTES.home },
  )
}

const syncButton = () => screen.getByRole('button', { name: 'Sync' })

/** Closes the progress dialog with its Close button (the footer's, not the x). */
async function closeDialog() {
  const buttons = within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Close' })
  await userEvent.click(buttons[buttons.length - 1])
}

/** The progress dialog's lines, as text. */
async function progress() {
  return (await screen.findByRole('list', { name: 'Progress' })).textContent
}

beforeEach(() => {
  fake.clientId = 'test-client-id'
  fake.accountId = '1'
  fake.drive = createFakeDrive()
  useAuthStore.setState({ profile, guest: false, token: null, driveToken: null })
  useSyncStore.setState({ running: false, dialogOpen: false, title: '', steps: [], dataVersion: 0 })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the Sync button, signed in', () => {
  it('backs up to OwnLedger/Backup in Drive, showing its progress', async () => {
    await createTestGroup(testDb.db, profile, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP' })
    const initTokenClient = stubGoogle()
    renderHeader()

    await userEvent.click(syncButton())

    expect(await screen.findByText('Syncing')).toBeInTheDocument()
    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))
    const backup = backupService.parse(fake.drive!.named('backup.json')!.content!)
    expect(backup?.rows.groups.map((group) => group.name)).toEqual(['Goa trip'])
    // Google was asked for Drive access, for the signed-in account.
    expect(initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({ scope: expect.stringContaining(DRIVE_SCOPE), hint: 'omkar@gmail.com', client_id: 'test-client-id' }),
    )
  })

  it('asks Google only once while the Drive access lasts', async () => {
    const initTokenClient = stubGoogle()
    renderHeader()

    await userEvent.click(syncButton())
    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))
    await userEvent.click(syncButton())
    await waitFor(() => expect(useSyncStore.getState().dataVersion).toBe(2))

    expect(initTokenClient).toHaveBeenCalledTimes(1)
  })

  it('says when the last sync finished when the pointer rests on it', async () => {
    stubGoogle()
    renderHeader()
    await userEvent.hover(syncButton())
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Sync and back up')
    await userEvent.unhover(syncButton())

    await userEvent.click(syncButton())
    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))
    await userEvent.hover(syncButton())

    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Last synced just now'))
  })

  it('refuses another Google account picked in Google\'s window, and backs up nothing', async () => {
    fake.accountId = 'someone-else'
    stubGoogle()
    renderHeader()

    await userEvent.click(syncButton())

    expect(await screen.findByText('Choose the Google account you signed in with to sync.')).toBeInTheDocument()
    expect(fake.drive!.files.size).toBe(0)
    expect(screen.queryByText('Syncing')).not.toBeInTheDocument()
    expect(useAuthStore.getState().driveToken).toBeNull()
  })

  it('explains that Drive access is needed when it was not given', async () => {
    stubGoogle({ error: 'access_denied' })
    renderHeader()

    await userEvent.click(syncButton())

    expect(
      await screen.findByText('OwnLedger needs access to your Drive to sync. Press Sync to try again.'),
    ).toBeInTheDocument()
    expect(fake.drive!.files.size).toBe(0)
  })

  it('needs an internet connection, and does not ask Google without one', async () => {
    const initTokenClient = stubGoogle()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderHeader()

    await userEvent.click(syncButton())

    expect(await screen.findByText('Sync needs an internet connection.')).toBeInTheDocument()
    expect(initTokenClient).not.toHaveBeenCalled()
  })

  it('stops when Drive access has run out, and asks again on the next press', async () => {
    const initTokenClient = stubGoogle()
    fake.drive!.state.expired = true
    renderHeader()

    await userEvent.click(syncButton())

    await waitFor(async () => expect(await progress()).toBe('BackupSign-in to Drive expired. Press Sync to continue.'))
    expect(useAuthStore.getState().driveToken).toBeNull()
    fake.drive!.state.expired = false
    await userEvent.click(syncButton())
    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))
    expect(initTokenClient).toHaveBeenCalledTimes(2)
  })

  it('says the backup failed for any other failure', async () => {
    stubGoogle()
    vi.spyOn(fake.drive!.client, 'findOwn').mockRejectedValue(new Error('Drive is full'))
    renderHeader()

    await userEvent.click(syncButton())

    await waitFor(async () => expect(await progress()).toBe("BackupCouldn't back up. Press Sync to try again."))
  })
})

describe('Restore from Drive', () => {
  async function restoreFromMenu() {
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(await screen.findByText('Restore from Drive'))
  }

  it('adds the backup to the data without asking, and says so', async () => {
    stubGoogle()
    await createTestGroup(testDb.db, profile, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP' })
    renderHeader()
    await userEvent.click(syncButton())
    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))
    // The device lost the group since; the backup still has it.
    await testDb.db.execute('truncate groups cascade')
    await closeDialog()

    await restoreFromMenu()

    expect(await screen.findByText('Backup restored.')).toBeInTheDocument()
    expect(await screen.findByText('Restoring')).toBeInTheDocument()
    expect(await progress()).toBe('BackupRestored')
    expect((await testDb.db.select().from(groups)).map((group) => group.name)).toEqual(['Goa trip'])
    expect(useSyncStore.getState().dataVersion).toBe(2)
  })

  it('says when there is no backup in the Drive', async () => {
    stubGoogle()
    renderHeader()

    await restoreFromMenu()

    await waitFor(async () => expect(await progress()).toBe('BackupNo backup found in your Drive.'))
  })

  it('says when the backup cannot be read, and changes nothing', async () => {
    stubGoogle()
    renderHeader()
    await userEvent.click(syncButton())
    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))
    fake.drive!.named('backup.json')!.content = '{"app":"ownledger"}'
    await closeDialog()

    await restoreFromMenu()

    await waitFor(async () => expect(await progress()).toBe("BackupThe backup in your Drive couldn't be read."))
  })
})

describe('the Sync button, as a guest', () => {
  beforeEach(() => {
    // Without a client id the prompt's Sign in with Google only explains it is not set up (no Google provider in tests).
    fake.clientId = ''
    useAuthStore.setState({ profile: null, guest: true })
  })

  it('asks to sign in with Google first, and backs up nothing', async () => {
    const initTokenClient = stubGoogle()
    renderHeader()

    await userEvent.click(syncButton())

    expect((await screen.findAllByText('Sign in to sync')).length).toBeGreaterThan(0)
    expect(
      screen.getByText(
        'Backup and sync use your Google Drive, so they need a Google sign-in. Your data on this device stays as it is.',
      ),
    ).toBeInTheDocument()
    expect(initTokenClient).not.toHaveBeenCalled()
    expect(fake.drive!.files.size).toBe(0)
  })

  it('closes with Cancel, and starts the sign-in with Sign in with Google', async () => {
    renderHeader()

    await userEvent.click(syncButton())
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryAllByText('Sign in to sync')).toHaveLength(0))

    await userEvent.click(syncButton())
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }))
    expect(
      await screen.findByText('Google sign-in is not configured yet (VITE_GOOGLE_CLIENT_ID is missing).'),
    ).toBeInTheDocument()
  })

  it('has no Restore from Drive in the guest menu', async () => {
    renderHeader()
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(await screen.findByText('Exit guest mode')).toBeInTheDocument()
    expect(screen.queryByText('Restore from Drive')).not.toBeInTheDocument()
  })
})
