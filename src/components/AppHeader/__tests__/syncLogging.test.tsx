// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { useSyncStore } from '../../../stores/useSyncStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { createFakeDrive } from '../../../testing/fakeDrive.ts'
import { captureLogs } from '../../../testing/logs.ts'
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


const logs = captureLogs()

async function progress() {
  const list = await screen.findByRole('list', { name: 'Progress' })
  return within(list).getAllByRole('listitem')[0].textContent
}

beforeEach(() => {
  fake.clientId = 'test-client-id'
  fake.accountId = '1'
  fake.drive = createFakeDrive()
  useAuthStore.setState({ profile, guest: false, token: null, driveToken: null })
  useSyncStore.setState({ running: false, dialogOpen: false, title: '', steps: [], dataVersion: 0 })
  logs.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const messages = (scope: string) => logs.lines.filter((line) => line.scope === scope).map((line) => line.message)

describe('a full sync is logged', () => {
  it('writes one line per step, in the order the steps happen', async () => {
    await createTestGroup(testDb.db, profile, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP' })
    stubGoogle()
    renderHeader()

    await userEvent.click(syncButton())
    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))

    expect(messages('sync')).toEqual([
      'Full sync started',
      'Backup in Drive merged',
      'Backup photos downloaded',
      'Group data synced',
      'Group photos synced',
      'Looked for shared groups',
      'Backup data written',
      'Backup photos uploaded',
      'Full sync ended',
    ])
    expect(messages('auth')).toContain('Asking Google for Drive access')
    expect(messages('auth')).toContain('Drive access granted')
  })

  it('says how each part ended, with counts', async () => {
    await createTestGroup(testDb.db, profile, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP' })
    stubGoogle()
    renderHeader()

    await userEvent.click(syncButton())
    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))

    const line = (message: string) => logs.lines.find((entry) => entry.message === message)
    expect(line('Backup in Drive merged')?.fields).toEqual({ ok: false, reason: 'none' })
    expect(line('Group data synced')?.fields).toMatchObject({ status: 'synced', sharedWith: 0, unreadable: 0 })
    expect(line('Group photos synced')?.fields).toMatchObject({ failures: 0, outOfSpace: false })
    expect(line('Looked for shared groups')?.fields).toEqual({ found: 0 })
    expect(line('Full sync ended')?.fields).toEqual({ ms: expect.any(Number) })
  })

  it('never writes emails, group names or the Drive token', async () => {
    await createTestGroup(testDb.db, profile, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP' })
    stubGoogle()
    renderHeader()

    await userEvent.click(syncButton())
    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))

    const text = JSON.stringify(logs.lines)
    for (const secret of ['omkar@gmail.com', 'Goa trip', 'Omkar', 'drive-token']) expect(text).not.toContain(secret)
  })
})

describe('sync problems are logged', () => {
  it('warns when pressed without a connection', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    stubGoogle()
    renderHeader()

    await userEvent.click(syncButton())

    expect(logs.lines.find((line) => line.scope === 'sync')).toMatchObject({
      level: 'warn',
      message: 'Sync refused, the device is offline',
    })
  })

  it('warns when there is no Drive access to ask for', async () => {
    fake.clientId = ''
    renderHeader()

    await userEvent.click(syncButton())

    expect(logs.lines).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        scope: 'auth',
        message: 'Drive access unavailable',
        fields: { signedIn: true, hasClientId: false, googleScriptLoaded: false },
      }),
    )
    expect(logs.lines).toContainEqual(
      expect.objectContaining({ scope: 'sync', message: 'Sync stopped, no Drive access', fields: { problem: 'unavailable' } }),
    )
  })

  it('warns when the user closes Google\'s window', async () => {
    vi.stubGlobal('google', {
      accounts: {
        oauth2: {
          initTokenClient: (config: { error_callback: (error: { type: string }) => void }) => ({
            requestAccessToken: () => config.error_callback({ type: 'popup_closed' }),
          }),
          hasGrantedAllScopes: () => false,
        },
      },
    })
    renderHeader()

    await userEvent.click(syncButton())

    await waitFor(() => expect(messages('auth')).toContain('Google window closed or blocked'))
    expect(logs.lines.find((line) => line.message === 'Google window closed or blocked')?.fields).toEqual({ type: 'popup_closed' })
    expect(logs.lines).toContainEqual(
      expect.objectContaining({ scope: 'sync', message: 'Sync stopped, no Drive access', fields: { problem: 'denied' } }),
    )
  })

  it('warns when Google hands back another account', async () => {
    fake.accountId = 'someone-else'
    stubGoogle()
    renderHeader()

    await userEvent.click(syncButton())

    await waitFor(() => expect(messages('auth')).toContain('Drive token belongs to another Google account'))
  })

  it('logs the failure that stops a run when Drive access runs out', async () => {
    fake.drive!.state.expired = true
    stubGoogle()
    renderHeader()

    await userEvent.click(syncButton())
    await waitFor(async () =>
      expect(await progress()).toBe('BackupSign-in to Drive expired. Press Continue to carry on.'),
    )

    expect(logs.lines).toContainEqual(
      expect.objectContaining({ level: 'error', scope: 'sync', message: 'Run stopped', fields: expect.objectContaining({ problem: 'expired', error: 'DriveAuthError' }) }),
    )
    expect(messages('sync').at(-1)).toBe('Full sync ended')
  })

  it('logs one start for one press', async () => {
    stubGoogle()
    renderHeader()
    await userEvent.click(syncButton())
    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))
    expect(messages('sync').filter((message) => message === 'Full sync started')).toHaveLength(1)
  })
})
