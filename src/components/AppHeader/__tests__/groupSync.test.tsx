// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { PGlite } from '@electric-sql/pglite'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { groups, people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { DriveError } from '../../../services/driveService'
import { DriveAuthError } from '../../../services/driveService'
import { groupService } from '../../../services/groupService'
import { photoService } from '../../../services/photoService'
import { syncService } from '../../../services/syncService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { useSyncStore } from '../../../stores/useSyncStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { createFakeDriveWorld } from '../../../testing/fakeDrive.ts'
import { addTestExpense } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { personIdForEmail } from '../../../testing/ids.ts'
import { renderPage } from '../../../testing/render.tsx'
import { SyncDialog } from '../../SyncDialog'
import { AppHeader } from '../index.tsx'

const fake = vi.hoisted(() => ({
  world: null as ReturnType<typeof import('../../../testing/fakeDrive.ts').createFakeDriveWorld> | null,
}))

vi.mock('../../../config.ts', () => ({ GOOGLE_CLIENT_ID: 'test-client-id', REQUIRE_INSTALL: true }))

vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

// The signed-in user's Drive is Omkar's in the shared fake Drive; other members use their own clients.
const omkarClient = vi.hoisted(() => ({ current: null as import('../../../services/driveService/types.ts').DriveClient | null }))
vi.mock('../../../services/driveService', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../services/driveService')>()
  return { ...original, driveService: { client: () => omkarClient.current! } }
})

vi.mock('../../../services/googleProfileService', () => ({
  googleProfileService: { fetchProfile: vi.fn(async () => ({ id: '1', email: 'omkar@gmail.com', name: 'Omkar' })) },
}))

const profile = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
/** How many times Google's window was asked for a Drive token. */
const google = { asked: 0 }
const testDb = setUpTestDatabase()

// Priya's device, for groups she makes and syncs.
let priyaPg: PGlite
let priyaDb: Database
beforeAll(async () => {
  priyaPg = new PGlite()
  priyaDb = await createDatabase(priyaPg)
})
afterAll(() => priyaPg.close())

beforeEach(async () => {
  await priyaPg.exec('truncate expense_photos, expense_shares, expenses, group_members, groups, people, sync_status cascade')
  google.asked = 0
  fake.world = createFakeDriveWorld()
  omkarClient.current = fake.world.clientFor('omkar@gmail.com')
  vi.stubGlobal('google', {
    accounts: {
      oauth2: {
        initTokenClient: (config: { callback: (response: unknown) => void }) => ({
          requestAccessToken: () => {
            google.asked++
            config.callback({ access_token: 'drive-token', expires_in: 3600 })
          },
        }),
        hasGrantedAllScopes: () => true,
      },
    },
  })
  useAuthStore.setState({ profile, guest: false, token: null, driveToken: null })
  useSyncStore.setState({ running: false, dialogOpen: false, title: '', steps: [], dataVersion: 0 })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderHeader() {
  return renderPage(
    <>
      <AppHeader />
      <SyncDialog />
    </>,
    { path: ROUTES.home },
  )
}

/** Presses Sync and waits for the run to end; returns the text of every line. */
async function syncAll() {
  await userEvent.click(screen.getByRole('button', { name: 'Sync' }))
  await waitFor(() => expect(useSyncStore.getState().running).toBe(false))
  await waitFor(() => expect(useSyncStore.getState().dataVersion).toBeGreaterThan(0))
  const list = await screen.findByRole('list', { name: 'Progress' })
  return within(list).getAllByRole('listitem').map((line) => line.textContent)
}

/** A group of Omkar's, with members given by email; returns its id. */
async function omkarsGroup(name: string, memberEmails: string[] = []) {
  const result = await createTestGroup(testDb.db, profile, { name, type: 'trip', defaultCurrency: 'GBP', memberEmails })
  if (!result.ok) throw new Error('group not created')
  return result.groupId
}

async function changedAt(groupId: string, iso: string) {
  await testDb.db.update(groups).set({ updatedAt: new Date(iso) }).where(eq(groups.id, groupId))
}

describe('groups in a full Sync', () => {
  it('lists Backup, then each group in the home page\'s order, each Synced', async () => {
    const older = await omkarsGroup('Lisbon')
    const newer = await omkarsGroup('Goa trip')
    await changedAt(older, '2026-10-01T10:00:00Z')
    await changedAt(newer, '2026-10-10T10:00:00Z')
    renderHeader()

    expect(await syncAll()).toEqual(['BackupBacked up', 'Goa tripSynced', 'LisbonSynced'])
    expect(fake.world!.files.size).toBeGreaterThan(0)
  })

  it('says with whom a group was just shared', async () => {
    await omkarsGroup('Goa trip', ['priya@gmail.com', 'sam@gmail.com'])
    renderHeader()

    expect(await syncAll()).toContain('Goa tripShared with Priya and Sam')
  })

  it('waits, with a clock, for the creator of a group that has no folder yet', async () => {
    const groupId = await omkarsGroup('Flat', ['priya@gmail.com'])
    await testDb.db.update(groups).set({ createdBy: personIdForEmail('priya@gmail.com') }).where(eq(groups.id, groupId))
    await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
    renderHeader()

    expect(await syncAll()).toContain('FlatWaiting for Priya to sync this group first.')
    const line = screen.getAllByRole('listitem').find((item) => item.textContent?.startsWith('Flat'))!
    expect(line.querySelector('.anticon-clock-circle')).not.toBeNull()
  })

  it('brings in a group someone shared, as a new group', async () => {
    // Priya, on her device, makes a group with Omkar and syncs it.
    const priya = crypto.randomUUID()
    await priyaDb.insert(people).values({ id: priya, email: 'priya@gmail.com', name: 'Priya Shah', updatedBy: priya })
    const omkarOnB = crypto.randomUUID()
    await priyaDb.insert(people).values({ id: omkarOnB, email: 'omkar@gmail.com', name: 'Omkar', updatedBy: priya })
    const lisbon = await groupService.createGroup(priyaDb, priya, { name: 'Lisbon', type: 'other', defaultCurrency: 'EUR', memberIds: [omkarOnB] })
    if (!lisbon.ok) throw new Error('group not created')
    await syncService.syncGroup(priyaDb, fake.world!.clientFor('priya@gmail.com'), priya, lisbon.groupId)
    renderHeader()

    expect(await syncAll()).toEqual(['BackupBacked up', 'New group: LisbonSynced'])
    expect((await testDb.db.select().from(groups)).map((group) => group.name)).toEqual(['Lisbon'])
  })

  it('shows Drive\'s reason when a group fails, and carries on with the others', async () => {
    const goa = await omkarsGroup('Goa trip', ['priya@gmail.com'])
    const lisbon = await omkarsGroup('Lisbon')
    await changedAt(goa, '2026-10-10T10:00:00Z')
    await changedAt(lisbon, '2026-10-01T10:00:00Z')
    vi.spyOn(omkarClient.current!, 'share').mockRejectedValue(
      new DriveError(403, JSON.stringify({ error: { message: 'The user does not have sufficient permissions for this file.' } })),
    )
    renderHeader()

    expect(await syncAll()).toEqual([
      'BackupBacked up',
      "Goa tripCouldn't sync this group. Press Sync to try again. 403: The user does not have sufficient permissions for this file.",
      'LisbonSynced',
    ])
  })

  it('says when another member\'s file could not be read', async () => {
    const groupId = await omkarsGroup('Goa trip', ['priya@gmail.com'])
    await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
    renderHeader()
    await syncAll()
    const folder = [...fake.world!.files.values()].find((file) => file.properties?.ownledger === 'group')!
    await fake.world!.clientFor('priya@gmail.com').createJson('bad.json', 'member-file', folder.id, 'nonsense', {
      ownledgerGroupId: groupId,
      ownledgerPersonId: personIdForEmail('priya@gmail.com'),
    })
    useSyncStore.setState({ dataVersion: 0 })

    expect(await syncAll()).toContain("Goa tripPriya's changes couldn't be read.")
  })

  it('gives looking for shared groups a line of its own when it fails', async () => {
    vi.spyOn(omkarClient.current!, 'findAll').mockRejectedValue(new DriveError(500, 'Backend Error'))
    renderHeader()

    expect(await syncAll()).toEqual([
      'BackupBacked up',
      "Groups shared with youCouldn't look for groups shared with you. Press Sync to try again. 500: Backend Error",
    ])
  })

  it('stops at the group where Drive access ran out', async () => {
    const goa = await omkarsGroup('Goa trip')
    const lisbon = await omkarsGroup('Lisbon')
    await changedAt(goa, '2026-10-10T10:00:00Z')
    await changedAt(lisbon, '2026-10-01T10:00:00Z')
    vi.spyOn(omkarClient.current!, 'listChildren').mockImplementation(async (folderId) => {
      const folder = fake.world!.files.get(folderId)
      if (folder?.properties?.ownledger === 'group') throw new DriveAuthError()
      return []
    })
    renderHeader()

    // The backup is written after the groups, so the stop leaves it unwritten.
    expect(await syncAll()).toEqual(['BackupNot backed up: the sync stopped.', 'Goa tripSign-in to Drive expired. Press Continue to carry on.'])
    expect(useAuthStore.getState().driveToken).toBeNull()
    expect([...fake.world!.files.values()].some((file) => file.name === 'backup.json')).toBe(false)
  })
})

describe('a device whose data was cleared', () => {
  it('gets back the groups the user created from their own folders, as new groups', async () => {
    await omkarsGroup('Goa trip')
    renderHeader()
    await syncAll()
    // No backup to bring them back: only the group's own folder has them.
    for (const [id, file] of fake.world!.files) if (file.name === 'backup.json') fake.world!.files.delete(id)
    await testDb.db.execute('truncate groups cascade')

    const runs = useSyncStore.getState().dataVersion
    await userEvent.click(screen.getByRole('button', { name: 'Sync' }))
    await waitFor(() => expect(useSyncStore.getState().dataVersion).toBe(runs + 1))

    const lines = within(screen.getByRole('list', { name: 'Progress' })).getAllByRole('listitem').map((line) => line.textContent)
    expect(lines).toEqual(['BackupBacked up', 'New group: Goa tripSynced'])

    expect((await testDb.db.select().from(groups)).map((group) => group.name)).toEqual(['Goa trip'])
    // The folder is the user's own, so no shortcut to it is added.
    expect([...fake.world!.files.values()].filter((file) => file.properties?.ownledger === 'group-shortcut')).toEqual([])
  })
})

describe('a group\'s photos', () => {
  /** The user's photo store: `renderPage` gives the signed-in user the account id as dataset. */
  const store = () => photoService.open(profile.id)

  /** Goa trip with one expense with a receipt photo on the device; returns the group and photo ids. */
  async function goaWithPhoto() {
    const groupId = await omkarsGroup('Goa trip')
    const photoId = crypto.randomUUID()
    await store().savePhoto(photoId, new Blob(['photo'], { type: 'image/jpeg' }), new Blob(['thumb']))
    await addTestExpense(testDb.db, profile.email, groupId, { receipts: [{ id: photoId, mimeType: 'image/jpeg', sizeBytes: 5 }] })
    return { groupId, photoId }
  }

  /** The group's line, as text. */
  const goaLine = () => screen.getAllByRole('listitem').find((item) => item.textContent?.startsWith('Goa trip'))?.textContent

  it('sends them after the data, counting, then says Synced', async () => {
    const { photoId } = await goaWithPhoto()
    const createFile = omkarClient.current!.createFile
    let release = () => {}
    vi.spyOn(omkarClient.current!, 'createFile').mockImplementation(async (...args) => {
      if (args[1] === 'group-photo') await new Promise<void>((resolve) => (release = resolve))
      return createFile(...args)
    })
    renderHeader()

    await userEvent.click(screen.getByRole('button', { name: 'Sync' }))
    await waitFor(() => expect(goaLine()).toBe('Goa tripSending photos… 0 of 1'))
    release()

    await waitFor(() => expect(goaLine()).toBe('Goa tripSynced'))
    expect([...fake.world!.files.values()].some((file) => file.properties?.ownledgerPhotoId === photoId && file.properties?.ownledger === 'group-photo')).toBe(true)
  })

  it('gets the ones the device lacks', async () => {
    const { photoId } = await goaWithPhoto()
    renderHeader()
    await syncAll()
    await store().deletePhoto(photoId)
    useSyncStore.setState({ dataVersion: 0 })

    expect(await syncAll()).toContain('Goa tripSynced')
    expect(await store().getPhoto(photoId)).not.toBeNull()
  })

  it('counts the photos that could not be synced', async () => {
    await goaWithPhoto()
    const createFile = omkarClient.current!.createFile
    vi.spyOn(omkarClient.current!, 'createFile').mockImplementation(async (...args) => {
      if (args[1] === 'group-photo') throw new Error('upload failed')
      return createFile(...args)
    })
    renderHeader()

    expect(await syncAll()).toContain("Goa trip1 photo couldn't be synced. Press Sync to try again.")
  })

  it('says when the device is out of space', async () => {
    const { photoId } = await goaWithPhoto()
    renderHeader()
    await syncAll()
    await store().deletePhoto(photoId)
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })
    useSyncStore.setState({ dataVersion: 0 })

    expect(await syncAll()).toContain('Goa tripThis device is out of space. Free some space, then sync again.')
  })

  it('puts every problem of the line in one place: an unreadable file and failed photos', async () => {
    const { groupId } = await goaWithPhoto()
    renderHeader()
    await syncAll()
    // A file by a writer this device does not know (the group is not shared with anyone, so it is written as the user).
    const folder = [...fake.world!.files.values()].find((file) => file.properties?.ownledger === 'group')!
    await omkarClient.current!.createJson('bad.json', 'member-file', folder.id, 'nonsense', {
      ownledgerGroupId: groupId,
      ownledgerPersonId: crypto.randomUUID(),
    })
    const photoId = crypto.randomUUID()
    await store().savePhoto(photoId, new Blob(['new'], { type: 'image/jpeg' }), new Blob(['thumb']))
    await addTestExpense(testDb.db, profile.email, groupId, { description: 'Taxi', receipts: [{ id: photoId, mimeType: 'image/jpeg', sizeBytes: 3 }] })
    const createFile = omkarClient.current!.createFile
    vi.spyOn(omkarClient.current!, 'createFile').mockImplementation(async (...args) => {
      if (args[1] === 'group-photo') throw new Error('upload failed')
      return createFile(...args)
    })
    useSyncStore.setState({ dataVersion: 0 })

    expect(await syncAll()).toContain(
      "Goa tripA member's changes couldn't be read. 1 photo couldn't be synced. Press Sync to try again.",
    )
  })
})

describe('failures that stop the run', () => {
  /** Two groups, Goa trip synced first (the more recent), then Lisbon. */
  async function twoGroups() {
    const goa = await omkarsGroup('Goa trip')
    const lisbon = await omkarsGroup('Lisbon')
    await changedAt(goa, '2026-10-10T10:00:00Z')
    await changedAt(lisbon, '2026-10-01T10:00:00Z')
    return { goa, lisbon }
  }

  const footer = () => {
    const button = screen.getAllByRole('button', { name: 'Close' }).at(-1)!
    return button.closest('.ant-drawer-footer, .ant-modal-footer') as HTMLElement
  }

  it('offers Continue when Drive access ran out, which asks Google again and finishes the sync', async () => {
    const { goa } = await twoGroups()
    const listChildren = omkarClient.current!.listChildren
    let expire = true
    vi.spyOn(omkarClient.current!, 'listChildren').mockImplementation(async (folderId) => {
      const folder = fake.world!.files.get(folderId)
      if (expire && folder?.properties?.ownledgerGroupId === goa && folder.properties.ownledger === 'group') {
        expire = false
        throw new DriveAuthError()
      }
      return listChildren(folderId)
    })
    renderHeader()

    expect(await syncAll()).toEqual(['BackupNot backed up: the sync stopped.', 'Goa tripSign-in to Drive expired. Press Continue to carry on.'])
    expect(google.asked).toBe(1)
    const runs = useSyncStore.getState().dataVersion

    await userEvent.click(within(footer()).getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(useSyncStore.getState().dataVersion).toBe(runs + 1))
    expect(google.asked).toBe(2)
    const lines = within(screen.getByRole('list', { name: 'Progress' })).getAllByRole('listitem').map((line) => line.textContent)
    expect(lines).toEqual(['BackupBacked up', 'Goa tripSynced', 'LisbonSynced'])
    expect(within(footer()).queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
  })

  it('stops at a dropped connection, with no Continue', async () => {
    const { goa } = await twoGroups()
    const listChildren = omkarClient.current!.listChildren
    vi.spyOn(omkarClient.current!, 'listChildren').mockImplementation(async (folderId) => {
      if (fake.world!.files.get(folderId)?.properties?.ownledgerGroupId === goa) throw new DriveError(0, 'Failed to fetch')
      return listChildren(folderId)
    })
    renderHeader()

    expect(await syncAll()).toEqual(['BackupNot backed up: the sync stopped.', 'Goa tripLost the connection. Press Sync to try again.'])
    expect(within(footer()).queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
  })

  it('stops when the Drive is full', async () => {
    await twoGroups()
    vi.spyOn(omkarClient.current!, 'createJson').mockRejectedValue(
      new DriveError(403, JSON.stringify({ error: { message: 'Quota', errors: [{ reason: 'storageQuotaExceeded' }] } })),
    )
    renderHeader()

    // The first file written is Goa trip's: the backup comes after the groups.
    expect(await syncAll()).toEqual(['BackupNot backed up: the sync stopped.', 'Goa tripYour Google Drive is full. Free some space in Drive, then sync again.'])
  })

  it('carries on after a group that failed for any other reason, with no Continue', async () => {
    const { goa } = await twoGroups()
    const listChildren = omkarClient.current!.listChildren
    vi.spyOn(omkarClient.current!, 'listChildren').mockImplementation(async (folderId) => {
      if (fake.world!.files.get(folderId)?.properties?.ownledgerGroupId === goa) throw new DriveError(404, 'Not found')
      return listChildren(folderId)
    })
    renderHeader()

    expect((await syncAll()).at(-1)).toBe('LisbonSynced')
    expect(within(footer()).queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
  })
})

describe('the sync dialog', () => {
  const leaving = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }

  it('asks before the tab is closed while a sync runs, and not after', async () => {
    await omkarsGroup('Goa trip')
    // The first upload (the backup) waits until released.
    const createJson = omkarClient.current!.createJson
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    vi.spyOn(omkarClient.current!, 'createJson').mockImplementationOnce(async (...args) => {
      await held
      return createJson(...args)
    })
    renderHeader()
    expect(leaving()).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Sync' }))
    await waitFor(() => expect(useSyncStore.getState().running).toBe(true))
    expect(leaving()).toBe(true)
    release()

    await waitFor(() => expect(useSyncStore.getState().running).toBe(false))
    expect(leaving()).toBe(false)
  })

  /** The dialog's footer. */
  const dialogFooter = () =>
    screen.getAllByRole('button', { name: 'Close' }).at(-1)!.closest('.ant-drawer-footer, .ant-modal-footer') as HTMLElement

  it('says in its footer when the last sync finished, once the run has ended', async () => {
    renderHeader()

    await syncAll()

    await waitFor(() => expect(dialogFooter()).toHaveTextContent('Last synced just now'))
  })

})
