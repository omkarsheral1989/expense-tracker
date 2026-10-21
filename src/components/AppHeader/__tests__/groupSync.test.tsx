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
import { syncService } from '../../../services/syncService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { useSyncStore } from '../../../stores/useSyncStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { createFakeDriveWorld } from '../../../testing/fakeDrive.ts'
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
  fake.world = createFakeDriveWorld()
  omkarClient.current = fake.world.clientFor('omkar@gmail.com')
  vi.stubGlobal('google', {
    accounts: {
      oauth2: {
        initTokenClient: (config: { callback: (response: unknown) => void }) => ({
          requestAccessToken: () => config.callback({ access_token: 'drive-token', expires_in: 3600 }),
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

    expect(await syncAll()).toEqual(['BackupBacked up', 'Goa tripSign-in to Drive expired. Press Sync to continue.'])
    expect(useAuthStore.getState().driveToken).toBeNull()
  })
})
