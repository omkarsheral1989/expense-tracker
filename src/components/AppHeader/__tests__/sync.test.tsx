// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groups } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { backupService } from '../../../services/backupService'
import { DRIVE_SCOPE } from '../../../services/driveService/constants.ts'
import type { DriveClient, DriveFile } from '../../../services/driveService/types.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { useSyncStore } from '../../../stores/useSyncStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { createFakeDrive } from '../../../testing/fakeDrive.ts'
import { addTestExpense } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { photoService } from '../../../services/photoService'
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

/** The user's photo store: `renderPage` gives the signed-in user the account id as dataset. */
const store = () => photoService.open(profile.id)

/** An expense with `count` receipt photos kept on the device; returns their ids. */
async function expenseWithPhotos(count: number) {
  const group = await createTestGroup(testDb.db, profile, { name: `Trip ${crypto.randomUUID()}`.slice(0, 40), type: 'trip', defaultCurrency: 'GBP' })
  if (!group.ok) throw new Error('group not created')
  const receipts = Array.from({ length: count }, () => ({ id: crypto.randomUUID(), mimeType: 'image/jpeg', sizeBytes: 5 }))
  for (const receipt of receipts) await store().savePhoto(receipt.id, new Blob(['photo'], { type: 'image/jpeg' }), new Blob(['thumb']))
  await addTestExpense(testDb.db, profile.email, group.groupId, { receipts })
  return receipts.map((receipt) => receipt.id)
}

/** Closes the progress dialog with its Close button (the footer's, not the x). */
async function closeDialog() {
  const buttons = within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Close' })
  await userEvent.click(buttons[buttons.length - 1])
}

/** The progress dialog's first line (the Backup line), as text. */
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

    await waitFor(async () => expect(await progress()).toBe('BackupSign-in to Drive expired. Press Continue to carry on.'))
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

describe('photos in the backup', () => {
  /** Lets the backup's own photo uploads through `upload`, and every other upload (a group's) as it was. */
  function backupUploads(upload: (...args: Parameters<DriveClient['createFile']>) => Promise<DriveFile>) {
    const createFile = fake.drive!.client.createFile
    return vi.spyOn(fake.drive!.client, 'createFile').mockImplementation((...args) =>
      args[1] === 'backup-photo' ? upload(...args) : createFile(...args),
    )
  }

  it('shows how many photos are backed up as it goes, then Backed up', async () => {
    stubGoogle()
    const photoIds = await expenseWithPhotos(2)
    const createFile = fake.drive!.client.createFile
    // Each upload waits until it is let go, one at a time.
    const releases: (() => void)[] = []
    backupUploads(async (...args) => {
      await new Promise<void>((resolve) => releases.push(resolve))
      return createFile(...args)
    })
    renderHeader()

    await userEvent.click(syncButton())

    await waitFor(async () => expect(await progress()).toBe('BackupBacking up photos… 1 of 2'))
    await waitFor(() => expect(releases).toHaveLength(2))
    releases[0]()
    await waitFor(async () => expect(await progress()).toBe('BackupBacking up photos… 2 of 2'))
    releases[1]()
    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))
    for (const photoId of photoIds) expect(fake.drive!.named(`${photoId}.jpg`)).toBeDefined()
  })

  it('says how many photos could not be backed up, one or several', async () => {
    stubGoogle()
    await expenseWithPhotos(2)
    const createFile = fake.drive!.client.createFile
    let failures = 2
    backupUploads(async (...args) => {
      if (failures-- > 0) throw new Error('upload failed')
      return createFile(...args)
    })
    renderHeader()

    await userEvent.click(syncButton())
    await waitFor(async () => expect(await progress()).toBe("Backup2 photos couldn't be backed up. Press Sync to try again."))

    // One of them went the next time.
    failures = 1
    await userEvent.click(syncButton())
    await waitFor(async () => expect(await progress()).toBe("Backup1 photo couldn't be backed up. Press Sync to try again."))
  })

  /** Two photos backed up, then taken off the device and out of the group's folder, so only the backup has them. */
  async function photosOnlyInTheBackup() {
    const ids = await expenseWithPhotos(2)
    renderHeader()
    await userEvent.click(syncButton())
    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))
    for (const id of ids) await store().deletePhoto(id)
    for (const [id, file] of fake.drive!.files) if (file.properties?.ownledger === 'group-photo') fake.drive!.files.delete(id)
    await closeDialog()
    return ids
  }

  it('downloads the backup\'s photos the device lacks, before the groups sync', async () => {
    stubGoogle()
    const ids = await photosOnlyInTheBackup()
    const downloadBlob = fake.drive!.client.downloadBlob
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    vi.spyOn(fake.drive!.client, 'downloadBlob').mockImplementation(async (fileId) => {
      await held
      return downloadBlob(fileId)
    })

    await userEvent.click(syncButton())

    await waitFor(async () => expect(await progress()).toBe('BackupDownloading photos… 1 of 2'))
    release()
    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))
    for (const id of ids) expect(await store().getPhoto(id)).not.toBeNull()
  })

  it('says how many of the backup\'s photos could not be downloaded, and when the device is full', async () => {
    stubGoogle()
    await photosOnlyInTheBackup()
    const downloads = vi.spyOn(fake.drive!.client, 'downloadBlob').mockRejectedValue(new Error('download failed'))

    await userEvent.click(syncButton())
    await waitFor(async () =>
      expect(await progress()).toBe("Backup2 photos couldn't be downloaded. Press Sync to try again."),
    )

    downloads.mockResolvedValue(new Blob(['photo'], { type: 'image/jpeg' }))
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })
    await closeDialog()
    await userEvent.click(syncButton())
    await waitFor(async () =>
      expect(await progress()).toBe('BackupThis device is out of space. Free some space, then sync again.'),
    )
  })
})

describe('the backup already in Drive', () => {
  /** Syncs once (so Drive has a backup with Goa trip), then the device loses its groups. */
  async function backupThenLoseGroups() {
    await createTestGroup(testDb.db, profile, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP' })
    renderHeader()
    await userEvent.click(syncButton())
    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))
    await testDb.db.execute('truncate groups cascade')
    await closeDialog()
  }

  const backupGroups = () =>
    backupService.parse(fake.drive!.named('backup.json')!.content!)?.rows.groups.map((group) => group.name)

  it('is added to the device by the next Sync, which then writes it back with nothing lost', async () => {
    stubGoogle()
    await backupThenLoseGroups()
    // Only the backup has the group now: its folder is gone too.
    for (const [id, file] of fake.drive!.files) if (file.properties?.ownledgerGroupId) fake.drive!.files.delete(id)

    await userEvent.click(syncButton())

    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))
    expect((await testDb.db.select().from(groups)).map((group) => group.name)).toEqual(['Goa trip'])
    expect(backupGroups()).toEqual(['Goa trip'])
    expect(screen.queryByText('Restoring')).not.toBeInTheDocument()
  })

  it('is got first and written last: "Getting your backup…", then "Waiting for your groups…", then "Saving your data…"', async () => {
    stubGoogle()
    await backupThenLoseGroups()
    const backupId = fake.drive!.named('backup.json')!.id
    // The backup file's download and its writing each wait until released.
    const hold = (method: 'download' | 'updateJson', heldId: string) => {
      const original = fake.drive!.client[method] as (...args: unknown[]) => Promise<unknown>
      let release = () => {}
      const held = new Promise<void>((resolve) => (release = resolve))
      vi.spyOn(fake.drive!.client, method).mockImplementation((async (fileId: string, ...rest: unknown[]) => {
        if (fileId === heldId) await held
        return original(fileId, ...rest)
      }) as never)
      return release
    }
    const releaseDownload = hold('download', backupId)
    const releaseWrite = hold('updateJson', backupId)
    // Goa trip's sync reads its folder; held there, the backup waits for it.
    const listChildren = fake.drive!.client.listChildren
    let releaseGroup = () => {}
    const groupHeld = new Promise<void>((resolve) => (releaseGroup = resolve))
    vi.spyOn(fake.drive!.client, 'listChildren').mockImplementation(async (folderId) => {
      if (fake.drive!.files.get(folderId)?.properties?.ownledger === 'group') await groupHeld
      return listChildren(folderId)
    })

    await userEvent.click(syncButton())

    await waitFor(async () => expect(await progress()).toBe('BackupGetting your backup…'))
    releaseDownload()
    await waitFor(async () => expect(await progress()).toBe('BackupWaiting for your groups…'))
    releaseGroup()
    await waitFor(async () => expect(await progress()).toBe('BackupSaving your data…'))
    releaseWrite()
    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))
  })

  it('is replaced, without a message, when it cannot be read', async () => {
    stubGoogle()
    renderHeader()
    await userEvent.click(syncButton())
    await waitFor(async () => expect(await progress()).toBe('BackupBacked up'))
    fake.drive!.named('backup.json')!.content = '{"app":"ownledger"}'
    await createTestGroup(testDb.db, profile, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP' })
    await closeDialog()

    await userEvent.click(syncButton())

    await waitFor(async () => expect(useSyncStore.getState().dataVersion).toBe(2))
    expect(await progress()).toBe('BackupBacked up')
    expect(backupGroups()).toEqual(['Goa trip'])
  })

  it('is left as it is when it could not be added to the device, and the groups still sync', async () => {
    stubGoogle()
    await backupThenLoseGroups()
    const before = fake.drive!.named('backup.json')!.content
    await createTestGroup(testDb.db, profile, { name: 'Lisbon', type: 'trip', defaultCurrency: 'GBP' })
    vi.spyOn(backupService, 'importAll').mockRejectedValueOnce(new Error('merge failed'))

    await userEvent.click(syncButton())

    await waitFor(async () => expect(useSyncStore.getState().dataVersion).toBe(2))
    const lines = within(screen.getByRole('list', { name: 'Progress' })).getAllByRole('listitem').map((line) => line.textContent)
    // Goa trip still comes back, from its own folder.
    expect(lines).toEqual(["BackupCouldn't back up. Press Sync to try again.", 'New group: Goa tripSynced', 'LisbonSynced'])
    expect(fake.drive!.named('backup.json')!.content).toBe(before)
  })

  it('leaves no Restore from Drive in the account menu: Sync does it', async () => {
    renderHeader()

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    expect(await screen.findByText('Sign out')).toBeInTheDocument()
    expect(screen.queryByText('Restore from Drive')).not.toBeInTheDocument()
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
