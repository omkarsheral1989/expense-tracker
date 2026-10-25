// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { PGlite } from '@electric-sql/pglite'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncDialog } from '../../../components/SyncDialog'
import { createDatabase, type Database } from '../../../db/client.ts'
import { DriveAuthError, DriveStopped } from '../../../services/driveService'
import { people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { expenseService } from '../../../services/expenseService'
import { groupService } from '../../../services/groupService'
import { syncService } from '../../../services/syncService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { useSyncStore } from '../../../stores/useSyncStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { createFakeDriveWorld } from '../../../testing/fakeDrive.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { GroupPage } from '../index.tsx'

const fake = vi.hoisted(() => ({
  clientId: 'test-client-id',
  omkar: null as import('../../../services/driveService/types.ts').DriveClient | null,
  options: undefined as import('../../../services/driveService/types.ts').ClientOptions | undefined,
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

vi.mock('../../../services/driveService', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../services/driveService')>()
  return {
    ...original,
    driveService: {
      client: (_token: string, options?: import('../../../services/driveService/types.ts').ClientOptions) => {
        fake.options = options
        return fake.omkar!
      },
    },
  }
})

vi.mock('../../../services/googleProfileService', () => ({
  googleProfileService: { fetchProfile: vi.fn(async () => ({ id: '1', email: 'omkar@gmail.com', name: 'Omkar' })) },
}))

const profile = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const testDb = setUpTestDatabase()
let world: ReturnType<typeof createFakeDriveWorld>

// Priya's device.
let priyaPg: PGlite
let priyaDb: Database
beforeAll(async () => {
  priyaPg = new PGlite()
  priyaDb = await createDatabase(priyaPg)
})
afterAll(() => priyaPg.close())

beforeEach(async () => {
  await priyaPg.exec('truncate expense_photos, expense_shares, expenses, group_members, groups, people, sync_status cascade')
  fake.clientId = 'test-client-id'
  world = createFakeDriveWorld()
  fake.omkar = world.clientFor('omkar@gmail.com')
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

/** Goa trip, Omkar's, with Priya. */
async function goaTrip() {
  const result = await createTestGroup(testDb.db, profile, {
    name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'],
  })
  if (!result.ok) throw new Error('group not created')
  await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
  return result.groupId
}

function renderGroup(groupId: string) {
  return renderPage(
    <>
      <GroupPage />
      <SyncDialog />
    </>,
    { path: ROUTES.group(groupId), pattern: ROUTES.groupPattern, routes: [ROUTES.home] },
  )
}

/** The band's Sync button, once the group is on screen. */
async function bandSync() {
  return screen.findByRole('button', { name: 'Sync' })
}

/** Presses the band's Sync and waits for the run to end; returns the dialog's lines. */
async function syncThisGroup() {
  const runs = useSyncStore.getState().dataVersion
  await userEvent.click(await bandSync())
  await waitFor(() => expect(useSyncStore.getState().dataVersion).toBe(runs + 1))
  const list = await screen.findByRole('list', { name: 'Progress' })
  return within(list).getAllByRole('listitem').map((line) => line.textContent)
}

/** Priya's device finds the group, syncs it, and (optionally) adds an expense and syncs again. */
async function priyaSyncs(groupId: string, expense?: string) {
  const priyaClient = world.clientFor('priya@gmail.com')
  let priya: string = crypto.randomUUID()
  await priyaDb.insert(people).values({ id: priya, email: 'priya@gmail.com', name: 'Priya Shah', updatedBy: priya })
  const { renamed } = await syncService.findSharedGroups(priyaDb, priyaClient, 'priya@gmail.com')
  priya = renamed.get(priya) ?? priya
  const first = await syncService.syncGroup(priyaDb, priyaClient, priya, groupId)
  if (first.status === 'synced') priya = first.renamed.get(priya) ?? priya
  if (!expense) return
  const group = await groupService.getGroup(priyaDb, priya, groupId)
  const values = Object.fromEntries(group!.members.map((member) => [member.personId, 1]))
  await expenseService.createExpense(priyaDb, priya, groupId, {
    description: expense, category: 'general', amountMinor: 900, currency: 'GBP', date: '2026-10-20',
    notes: '', paidBy: priya, split: { method: 'equal', values }, receipts: [],
  })
  await syncService.syncGroup(priyaDb, priyaClient, priya, groupId)
}

describe('the band\'s Sync button', () => {
  it('syncs only this group, without the backup', async () => {
    const groupId = await goaTrip()
    renderGroup(groupId)

    expect(await syncThisGroup()).toEqual(['Goa tripShared with Priya'])
    expect(world.named('backup.json')).toBeUndefined()
    expect(world.named('Goa trip')).toMatchObject({ folder: true })
  })

  it('says "Sync this group" until the group\'s first sync, then when it last synced', async () => {
    const groupId = await goaTrip()
    renderGroup(groupId)
    await userEvent.hover(await bandSync())
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Sync this group')
    await userEvent.unhover(await bandSync())

    await syncThisGroup()
    await userEvent.hover(await bandSync())

    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Last synced just now'))
  })

  it('shows what other members added once it has synced', async () => {
    const groupId = await goaTrip()
    renderGroup(groupId)
    await syncThisGroup()
    await priyaSyncs(groupId, 'Taxi')
    expect(screen.queryByText('Taxi')).not.toBeInTheDocument()

    await syncThisGroup()

    expect(await screen.findByText('Taxi')).toBeInTheDocument()
  })

  it('takes Pending off a member once their own file has been read', async () => {
    const groupId = await goaTrip()
    renderGroup(groupId)
    await syncThisGroup()
    await userEvent.click(await screen.findByRole('button', { name: /(?<!\d)2 members$/ }))
    const sheet = () => screen.getAllByRole('dialog').find((dialog) => dialog.textContent?.startsWith('Members'))!
    expect(within(sheet()).getByText('Pending')).toBeInTheDocument()
    await priyaSyncs(groupId)

    await syncThisGroup()

    await waitFor(() => expect(within(sheet()).queryByText('Pending')).not.toBeInTheDocument())
    expect(within(sheet()).getByText('You')).toBeInTheDocument()
  })

  it('says in the dialog\'s footer when this group last synced', async () => {
    const groupId = await goaTrip()
    renderGroup(groupId)

    await syncThisGroup()

    // Only the group synced (no backup), so the footer can only be the group's time.
    const footer = screen.getAllByRole('button', { name: 'Close' }).at(-1)!.closest('.ant-drawer-footer, .ant-modal-footer')
    await waitFor(() => expect(footer).toHaveTextContent('Last synced just now'))
  })

  it('offers Continue after Drive access ran out, which syncs this group again and nothing else', async () => {
    const groupId = await goaTrip()
    vi.spyOn(fake.omkar!, 'listChildren').mockRejectedValueOnce(new DriveAuthError())
    renderGroup(groupId)
    // The first run makes the folder, then Drive access runs out as it reads the members' files.
    await syncThisGroup()
    const lines = () => within(screen.getByRole('list', { name: 'Progress' })).getAllByRole('listitem').map((line) => line.textContent)
    expect(lines()).toEqual(['Goa tripSign-in to Drive expired. Press Continue to carry on.'])
    const runs = useSyncStore.getState().dataVersion

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(useSyncStore.getState().dataVersion).toBe(runs + 1))
    expect(lines()).toEqual(['Goa tripShared with Priya'])
    expect(world.named('backup.json')).toBeUndefined()
  })

  it('can be stopped with Stop, which ends the run and says so', async () => {
    const groupId = await goaTrip()
    let reached = () => {}
    const reading = new Promise<void>((resolve) => (reached = resolve))
    vi.spyOn(fake.omkar!, 'listChildren').mockImplementation(async () => {
      reached()
      await new Promise<never>((_resolve, reject) => fake.options!.signal!.addEventListener('abort', () => reject(new DriveStopped())))
      return []
    })
    renderGroup(groupId)

    await userEvent.click(await bandSync())
    await reading
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(useSyncStore.getState().running).toBe(false))

    expect(fake.options!.signal!.aborted).toBe(true)
    const lines = within(screen.getByRole('list', { name: 'Progress' })).getAllByRole('listitem').map((line) => line.textContent)
    expect(lines).toEqual(['Goa tripStopped. Press Sync to carry on.'])
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
  })

  it('asks a guest to sign in first', async () => {
    // Without a client id the prompt's Sign in with Google only explains it is not set up (no Google provider in tests).
    fake.clientId = ''
    useAuthStore.setState({ profile: null, guest: true })
    // The test helpers save the guest under the person id `renderPage` gives a guest.
    const result = await createTestGroup(testDb.db, { email: 'guest', name: 'Guest' }, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP' })
    if (!result.ok) throw new Error('group not created')
    renderGroup(result.groupId)

    await userEvent.click(await bandSync())

    expect((await screen.findAllByText('Sign in to sync')).length).toBeGreaterThan(0)
    expect(world.files.size).toBe(0)
  })
})
