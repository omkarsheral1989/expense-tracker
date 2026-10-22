// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { groupMembers, groups, people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestPerson, createTestGroup } from '../../../testing/groups.ts'
import { personIdForEmail } from '../../../testing/ids.ts'
import { renderPage } from '../../../testing/render.tsx'
import { GroupPage } from '../index.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
// The band's Sync button lets a guest sign in with Google; without a client id it only says that is not set up,
// so the tests do not depend on this machine's .env.local (there is no Google provider in tests).
vi.mock('../../../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: true }))

vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const testDb = setUpTestDatabase()

async function createGroup(memberEmails: string[] = []) {
  const result = await createTestGroup(testDb.db, me, {
    name: 'Goa trip',
    type: 'trip',
    defaultCurrency: 'GBP',
    memberEmails,
  })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.groupId
}

function renderGroup(groupId: string) {
  return renderPage(<GroupPage />, {
    path: ROUTES.group(groupId),
    pattern: ROUTES.groupPattern,
    routes: [ROUTES.home, ROUTES.editGroupPattern, ROUTES.newExpensePattern, ROUTES.expensePattern],
  })
}

/** Matches a button by the end of its text (Ant Design puts an icon's name in front of it). */
function named(text: string) {
  return new RegExp(`(?<!\\d)${text}$`)
}

/**
 * The sheet or dialog with this title, once it is on the page. (Found by its
 * title text: in jsdom Ant Design gives every sheet the same `aria-labelledby`
 * id, so a stacked sheet's accessible name is the first one's.) With several of
 * the same title, such as one opened twice, the newest.
 */
async function findSheet(title: string) {
  return waitFor(() => {
    const found = [...document.querySelectorAll<HTMLElement>('[role=dialog]')].filter(
      (dialog) => dialog.querySelector('.ant-drawer-title, .ant-modal-title')?.textContent === title,
    )
    if (found.length === 0) throw new Error(`No sheet titled ${title}`)
    return found[found.length - 1]
  })
}

/** Whether the sheet or dialog with this title is closed (Ant Design keeps a closed one in the page, hidden). */
function isClosed(title: string) {
  const heading = [...document.querySelectorAll('.ant-drawer-title, .ant-modal-title')].find(
    (element) => element.textContent === title,
  )
  const panel = heading?.closest('.ant-drawer-content-wrapper, .ant-modal-wrap')
  return !panel || panel.classList.contains('ant-drawer-content-wrapper-hidden') || (panel as HTMLElement).style.display === 'none'
}

/** Pretends the screen is wide (desktop) or narrow (phone) for Ant Design's breakpoints. */
function setScreenWide(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: wide && /min-width/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

const memberNames = async (groupId: string) => {
  const rows = await testDb.db
    .select({ name: people.name, email: people.email, deletedAt: groupMembers.deletedAt })
    .from(groupMembers)
    .innerJoin(people, eq(people.id, groupMembers.personId))
    .where(eq(groupMembers.groupId, groupId))
  return rows.filter((row) => !row.deletedAt).map((row) => row.name ?? row.email).sort()
}

describe('adding a member from the members sheet', () => {
  const originalMatchMedia = window.matchMedia
  let user: ReturnType<typeof userEvent.setup>

  /** Opens the members sheet, then the "Add a member" sheet, and returns the latter. */
  async function openPicker(count: number) {
    await user.click(await screen.findByRole('button', { name: named(`${count} (people|person)`) }))
    const sheet = await screen.findByRole('dialog', { name: `Members (${count})` })
    await user.click(within(sheet).getByRole('button', { name: named('Add member') }))
    return findSheet('Add a member')
  }

  const personButton = (picker: HTMLElement, name: string) =>
    within(picker).getByRole('button', { name: new RegExp(name) })
  const addButton = (picker: HTMLElement) => within(picker).getByRole('button', { name: 'Add' })
  const cancelButton = (picker: HTMLElement) => within(picker).getByRole('button', { name: 'Cancel' })
  const listed = (picker: HTMLElement) =>
    within(within(picker).getByRole('list', { name: 'People you know' }))
      .queryAllByRole('button')
      .map((button) => button.querySelector('strong')?.textContent)

  beforeEach(() => {
    user = userEvent.setup()
    useAuthStore.setState({ profile: me, guest: false, token: null })
  })
  afterEach(() => {
    cleanup()
    window.matchMedia = originalMatchMedia
    vi.restoreAllMocks()
    vi.mocked(getDb).mockClear()
  })

  describe('the members sheet', () => {
    it('ends with an "Add member" button and has no people picker of its own', async () => {
      const id = await createGroup(['priya@gmail.com'])
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      renderGroup(id)

      await user.click(await screen.findByRole('button', { name: named('2 people') }))
      const sheet = await screen.findByRole('dialog', { name: 'Members (2)' })

      expect(within(sheet).getByRole('button', { name: named('Add member') })).toBeEnabled()
      expect(within(sheet).queryByRole('combobox')).not.toBeInTheDocument()
      expect(within(sheet).queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'Add a member' })).not.toBeInTheDocument()
    })

    it('shows the button to a guest, who can add people too', async () => {
      useAuthStore.setState({ profile: null, guest: true, token: null })
      const result = await createTestGroup(testDb.db, { email: 'guest', name: 'Guest' }, {
        name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: [],
      })
      if (!result.ok) throw new Error('refused')
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      renderGroup(result.groupId)

      const picker = await openPicker(1)
      // The guest is the group's only member; the other people saved here are offered.
      expect(listed(picker)).toEqual(['Omkar Sheral', 'Sam Lee'])
    })
  })

  describe('pictures', () => {
    it('shows a person\'s Google picture in the members sheet and in the list of people to add, the letter for the others', async () => {
      const id = await createGroup(['priya@gmail.com'])
      await testDb.db.update(people).set({ picture: 'https://example.com/priya.png' }).where(eq(people.email, 'priya@gmail.com'))
      const sam = await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      await testDb.db.update(people).set({ picture: 'https://example.com/sam.png' }).where(eq(people.id, sam))
      await addTestPerson(testDb.db, me, { name: 'Ana Ruiz' })
      renderGroup(id)

      const picker = await openPicker(2)
      expect(personButton(picker, 'Sam Lee').querySelector('img')).toHaveAttribute('src', 'https://example.com/sam.png')
      expect(personButton(picker, 'Ana Ruiz').querySelector('img')).toBeNull()
      expect(within(personButton(picker, 'Ana Ruiz')).getByText('A')).toBeInTheDocument()

      const sheet = await findSheet('Members (2)')
      const sources = [...sheet.querySelectorAll('img')].map((image) => image.getAttribute('src'))
      expect(sources).toEqual(['https://example.com/priya.png'])
    })
  })

  describe('the "Add a member" sheet', () => {
    it('lists the people saved on the device who are not in the group, with Cancel and Add (switched off)', async () => {
      const id = await createGroup(['priya@gmail.com'])
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      await addTestPerson(testDb.db, me, { name: 'Ana Ruiz', email: 'ana@gmail.com' })
      renderGroup(id)

      const picker = await openPicker(2)

      // Priya is in the group and the user is never listed.
      expect(listed(picker)).toEqual(['Ana Ruiz', 'Sam Lee'])
      expect(within(picker).getByText('ana@gmail.com')).toBeInTheDocument()
      expect(within(picker).getByText('No email')).toBeInTheDocument()
      expect(within(picker).getByRole('textbox', { name: 'Search people' })).toBeInTheDocument()
      expect(cancelButton(picker)).toBeEnabled()
      expect(addButton(picker)).toBeDisabled()
    })

    it('says so when everyone saved is already in the group, and still offers "Add a new member"', async () => {
      const id = await createGroup(['priya@gmail.com'])
      renderGroup(id)

      const picker = await openPicker(2)

      expect(within(picker).getByText('Everyone you know is already in this group.')).toBeInTheDocument()
      expect(within(picker).getByRole('button', { name: named('Add a new member') })).toBeEnabled()
    })

    it('finds people by name or by address, ignoring case, and says when no one matches', async () => {
      const id = await createGroup()
      await addTestPerson(testDb.db, me, { name: 'Sam Lee', email: 'sam@gmail.com' })
      await addTestPerson(testDb.db, me, { name: 'Ana Ruiz', email: 'ana.r@gmail.com' })
      renderGroup(id)
      const picker = await openPicker(1)
      const search = within(picker).getByRole('textbox', { name: 'Search people' })

      await user.type(search, 'SAM')
      expect(listed(picker)).toEqual(['Sam Lee'])

      await user.clear(search)
      await user.type(search, 'ana.r@')
      expect(listed(picker)).toEqual(['Ana Ruiz'])

      await user.clear(search)
      await user.type(search, 'zzz')
      expect(listed(picker)).toEqual([])
      expect(within(picker).getByText('No one matches.')).toBeInTheDocument()
      expect(within(picker).queryByText('Everyone you know is already in this group.')).not.toBeInTheDocument()
    })

    it('ticks a person with a tap and unticks them with another, and Add is on only while someone is ticked', async () => {
      const id = await createGroup()
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      await addTestPerson(testDb.db, me, { name: 'Ana Ruiz' })
      renderGroup(id)
      const picker = await openPicker(1)

      await user.click(personButton(picker, 'Sam Lee'))
      expect(personButton(picker, 'Sam Lee')).toHaveAttribute('aria-pressed', 'true')
      expect(personButton(picker, 'Ana Ruiz')).toHaveAttribute('aria-pressed', 'false')
      expect(addButton(picker)).toBeEnabled()

      await user.click(personButton(picker, 'Ana Ruiz'))
      await user.click(personButton(picker, 'Sam Lee'))
      expect(personButton(picker, 'Sam Lee')).toHaveAttribute('aria-pressed', 'false')
      expect(addButton(picker)).toBeEnabled()

      await user.click(personButton(picker, 'Ana Ruiz'))
      expect(addButton(picker)).toBeDisabled()
    })

    it('keeps a ticked person ticked while the search narrows the list', async () => {
      const id = await createGroup()
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      await addTestPerson(testDb.db, me, { name: 'Ana Ruiz' })
      renderGroup(id)
      const picker = await openPicker(1)
      await user.click(personButton(picker, 'Sam Lee'))

      const search = within(picker).getByRole('textbox', { name: 'Search people' })
      await user.type(search, 'ana')
      expect(listed(picker)).toEqual(['Ana Ruiz'])
      await user.clear(search)

      expect(personButton(picker, 'Sam Lee')).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('pressing Add', () => {
    it('adds the person ticked, says so, closes the sheet, and the members sheet shows them with the new count', async () => {
      const id = await createGroup(['priya@gmail.com'])
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      renderGroup(id)
      const picker = await openPicker(2)
      await user.click(personButton(picker, 'Sam Lee'))

      await user.click(addButton(picker))

      expect(await screen.findByText('Sam added.')).toBeInTheDocument()
      const sheet = await screen.findByRole('dialog', { name: 'Members (3)' })
      expect(within(sheet).getByText('Sam Lee')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: named('3 people') })).toBeInTheDocument()
      await waitFor(() => expect(isClosed('Add a member')).toBe(true))
      expect(isClosed('Members (3)')).toBe(false)
      expect(await memberNames(id)).toEqual(['Omkar Sheral', 'Sam Lee', 'priya@gmail.com'])
    })

    it('adds everyone ticked, one message for all', async () => {
      const id = await createGroup()
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      await addTestPerson(testDb.db, me, { name: 'Ana Ruiz' })
      await addTestPerson(testDb.db, me, { name: 'Zed Zane' })
      renderGroup(id)
      const picker = await openPicker(1)
      await user.click(personButton(picker, 'Sam Lee'))
      await user.click(personButton(picker, 'Ana Ruiz'))

      await user.click(addButton(picker))

      expect(await screen.findByText('2 members added.')).toBeInTheDocument()
      expect(await screen.findByRole('dialog', { name: 'Members (3)' })).toBeInTheDocument()
      expect(await memberNames(id)).toEqual(['Ana Ruiz', 'Omkar Sheral', 'Sam Lee'])
    })

    it('lets the same person be added again later, once removed, as a returning member', async () => {
      const id = await createGroup(['priya@gmail.com'])
      await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
      await testDb.db
        .update(groupMembers)
        .set({ deletedAt: new Date() })
        .where(and(eq(groupMembers.groupId, id), eq(groupMembers.personId, personIdForEmail('priya@gmail.com'))))
      renderGroup(id)
      const picker = await openPicker(1)
      expect(listed(picker)).toEqual(['Priya Shah'])
      await user.click(personButton(picker, 'Priya Shah'))

      await user.click(addButton(picker))

      expect(await screen.findByRole('dialog', { name: 'Members (2)' })).toBeInTheDocument()
      expect(await memberNames(id)).toEqual(['Omkar Sheral', 'Priya Shah'])
    })

    it('moves the group to the top of the list of groups', async () => {
      const id = await createGroup()
      await testDb.db.update(groups).set({ updatedAt: new Date('2026-01-01T00:00:00Z') }).where(eq(groups.id, id))
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      renderGroup(id)
      const picker = await openPicker(1)
      await user.click(personButton(picker, 'Sam Lee'))

      await user.click(addButton(picker))
      await screen.findByRole('dialog', { name: 'Members (2)' })

      const [row] = await testDb.db.select().from(groups).where(eq(groups.id, id))
      expect(row.updatedAt.getTime()).toBeGreaterThan(new Date('2026-06-01T00:00:00Z').getTime())
      expect(row.updatedBy).toBe(personIdForEmail(me.email))
    })

    it('keeps the group on screen while it is read again, instead of showing the loading placeholder', async () => {
      const id = await createGroup()
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      renderGroup(id)
      const picker = await openPicker(1)
      await user.click(personButton(picker, 'Sam Lee'))
      // The first read is Add's own; the next one (the page reading the group again) never finishes.
      const db = await getDb()
      vi.mocked(getDb).mockImplementationOnce(async () => db).mockImplementationOnce(() => new Promise(() => {}))

      await user.click(addButton(picker))

      expect(await screen.findByText('Sam added.')).toBeInTheDocument()
      expect(screen.queryByRole('status', { name: 'Loading the group' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Goa trip' })).toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Members (1)' })).toBeInTheDocument()
    })

    it('works in the centered dialog of a wide screen too', async () => {
      setScreenWide(true)
      const id = await createGroup()
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      renderGroup(id)
      const picker = await openPicker(1)
      await user.click(personButton(picker, 'Sam Lee'))

      await user.click(addButton(picker))

      expect(await screen.findByText('Sam added.')).toBeInTheDocument()
      expect(await memberNames(id)).toEqual(['Omkar Sheral', 'Sam Lee'])
    })

    it('says so and keeps the sheet and the ticks when saving fails, and works on a second try', async () => {
      const id = await createGroup()
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      renderGroup(id)
      const picker = await openPicker(1)
      await user.click(personButton(picker, 'Sam Lee'))
      vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))

      await user.click(addButton(picker))

      expect(await screen.findByText("Couldn't add the member. Please try again.")).toBeInTheDocument()
      expect(isClosed('Add a member')).toBe(false)
      expect(personButton(picker, 'Sam Lee')).toHaveAttribute('aria-pressed', 'true')
      expect(await memberNames(id)).toEqual(['Omkar Sheral'])

      await user.click(addButton(picker))
      expect(await screen.findByRole('dialog', { name: 'Members (2)' })).toBeInTheDocument()
      expect(await memberNames(id)).toEqual(['Omkar Sheral', 'Sam Lee'])
    })

    it('says who is already in the group when someone else added them meanwhile, and keeps the sheet open', async () => {
      const id = await createGroup()
      const samId = await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      renderGroup(id)
      const picker = await openPicker(1)
      await user.click(personButton(picker, 'Sam Lee'))
      await testDb.db.insert(groupMembers).values({ groupId: id, personId: samId, updatedBy: samId })

      await user.click(addButton(picker))

      expect(await screen.findByText('Sam Lee is already in this group.')).toBeInTheDocument()
      expect(isClosed('Add a member')).toBe(false)
    })

    it('says the group is no longer available when it was deleted meanwhile', async () => {
      const id = await createGroup()
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      renderGroup(id)
      const picker = await openPicker(1)
      await user.click(personButton(picker, 'Sam Lee'))
      await testDb.db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, id))

      await user.click(addButton(picker))

      expect(await screen.findByText('This group is no longer available.')).toBeInTheDocument()
    })
  })

  describe('Cancel', () => {
    it('closes the sheet and adds no one', async () => {
      const id = await createGroup()
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      renderGroup(id)
      const picker = await openPicker(1)
      await user.click(personButton(picker, 'Sam Lee'))

      await user.click(cancelButton(picker))

      await waitFor(() => expect(isClosed('Add a member')).toBe(true))
      expect(isClosed('Members (1)')).toBe(false)
      expect(screen.queryByText('Sam added.')).not.toBeInTheDocument()
      expect(await memberNames(id)).toEqual(['Omkar Sheral'])
    })

    it('opens again with nobody ticked and an empty search', async () => {
      const id = await createGroup()
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      await addTestPerson(testDb.db, me, { name: 'Ana Ruiz' })
      renderGroup(id)
      const first = await openPicker(1)
      await user.click(personButton(first, 'Sam Lee'))
      await user.type(within(first).getByRole('textbox', { name: 'Search people' }), 'sam')
      await user.click(cancelButton(first))
      await waitFor(() => expect(isClosed('Add a member')).toBe(true))

      await user.click(within(screen.getByRole('dialog', { name: 'Members (1)' })).getByRole('button', { name: named('Add member') }))
      const again = await findSheet('Add a member')

      expect(within(again).getByRole('textbox', { name: 'Search people' })).toHaveValue('')
      expect(listed(again)).toEqual(['Ana Ruiz', 'Sam Lee'])
      expect(personButton(again, 'Sam Lee')).toHaveAttribute('aria-pressed', 'false')
      expect(addButton(again)).toBeDisabled()
    })
  })

  describe('"Add a new member"', () => {
    const newMemberDialog = () => findSheet('Add a new member')

    async function openNewMember(picker: HTMLElement) {
      await user.click(within(picker).getByRole('button', { name: named('Add a new member') }))
      return newMemberDialog()
    }

    it('opens the name and email dialog over the sheet', async () => {
      const id = await createGroup()
      renderGroup(id)
      const picker = await openPicker(1)

      const dialog = await openNewMember(picker)

      expect(within(dialog).getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
      expect(within(dialog).getByRole('textbox', { name: 'Email (optional)' })).toBeInTheDocument()
    })

    it('saves the person and lists them ticked in the sheet, but does not put them in the group yet', async () => {
      const id = await createGroup()
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      renderGroup(id)
      const picker = await openPicker(1)
      const dialog = await openNewMember(picker)

      await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Dev Patel')
      await user.click(within(dialog).getByRole('button', { name: 'Add' }))

      await waitFor(() => expect(personButton(picker, 'Dev Patel')).toHaveAttribute('aria-pressed', 'true'))
      expect(personButton(picker, 'Sam Lee')).toHaveAttribute('aria-pressed', 'false')
      expect(addButton(picker)).toBeEnabled()
      // Saved on the device, but not a member, and the group has not changed.
      const [saved] = await testDb.db.select().from(people).where(eq(people.name, 'Dev Patel'))
      expect(saved.email).toBeNull()
      expect(await memberNames(id)).toEqual(['Omkar Sheral'])
      expect(isClosed('Members (1)')).toBe(false)
      expect(screen.queryByText('Dev added.')).not.toBeInTheDocument()
      await waitFor(() => expect(isClosed('Add a new member')).toBe(true))
    })

    it('puts them in the group when Add is pressed, together with anyone else ticked', async () => {
      const id = await createGroup()
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      renderGroup(id)
      const picker = await openPicker(1)
      await user.click(personButton(picker, 'Sam Lee'))
      const dialog = await openNewMember(picker)
      await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Dev Patel')
      await user.type(within(dialog).getByRole('textbox', { name: 'Email (optional)' }), 'dev@gmail.com')
      await user.click(within(dialog).getByRole('button', { name: 'Add' }))
      await waitFor(() => expect(personButton(picker, 'Dev Patel')).toHaveAttribute('aria-pressed', 'true'))

      await user.click(addButton(picker))

      expect(await screen.findByText('2 members added.')).toBeInTheDocument()
      expect(await screen.findByRole('dialog', { name: 'Members (3)' })).toBeInTheDocument()
      expect(await memberNames(id)).toEqual(['Dev Patel', 'Omkar Sheral', 'Sam Lee'])
    })

    it('leaves them saved but out of the group when the sheet is cancelled', async () => {
      const id = await createGroup()
      renderGroup(id)
      const picker = await openPicker(1)
      const dialog = await openNewMember(picker)
      await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Dev Patel')
      await user.click(within(dialog).getByRole('button', { name: 'Add' }))
      await waitFor(() => expect(personButton(picker, 'Dev Patel')).toBeInTheDocument())

      await user.click(cancelButton(picker))

      await waitFor(() => expect(isClosed('Add a member')).toBe(true))
      expect(await testDb.db.select().from(people).where(eq(people.name, 'Dev Patel'))).toHaveLength(1)
      expect(await memberNames(id)).toEqual(['Omkar Sheral'])
    })

    it('shows a problem beside its field and adds no one, such as a name already used', async () => {
      const id = await createGroup()
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      renderGroup(id)
      const picker = await openPicker(1)
      const dialog = await openNewMember(picker)

      await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'sam  LEE')
      await user.click(within(dialog).getByRole('button', { name: 'Add' }))

      expect(await within(dialog).findByText('You already have someone called Sam Lee.')).toBeInTheDocument()
      expect(listed(picker)).toEqual(['Sam Lee'])
      expect(addButton(picker)).toBeDisabled()
    })

    it('starts the search over so the new person is in view', async () => {
      const id = await createGroup()
      await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
      renderGroup(id)
      const picker = await openPicker(1)
      await user.type(within(picker).getByRole('textbox', { name: 'Search people' }), 'sam')
      const dialog = await openNewMember(picker)

      await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Dev Patel')
      await user.click(within(dialog).getByRole('button', { name: 'Add' }))

      await waitFor(() => expect(listed(picker)).toEqual(['Dev Patel', 'Sam Lee']))
      expect(within(picker).getByRole('textbox', { name: 'Search people' })).toHaveValue('')
    })
  })

  describe('stacked sheets', () => {
    /** The sheet with this title moves up 180 px (Ant Design's "push") while another is open over it. */
    const isPushed = async (title: string) =>
      (await findSheet(title)).closest('.ant-drawer-content-wrapper')?.getAttribute('style')?.includes('translateY(-180px)') ?? false

    it('pushes the members sheet up while "Add a member" is open over it, and back when it closes', async () => {
      const id = await createGroup()
      renderGroup(id)
      await user.click(await screen.findByRole('button', { name: named('1 person') }))
      await findSheet('Members (1)')
      expect(await isPushed('Members (1)')).toBe(false)

      await user.click(within(await findSheet('Members (1)')).getByRole('button', { name: named('Add member') }))
      const picker = await findSheet('Add a member')
      await waitFor(async () => expect(await isPushed('Members (1)')).toBe(true))
      expect(await isPushed('Add a member')).toBe(false)

      await user.click(cancelButton(picker))
      await waitFor(async () => expect(await isPushed('Members (1)')).toBe(false))
    })

    it('pushes "Add a member" up as well while the new-member dialog is open over it', async () => {
      const id = await createGroup()
      renderGroup(id)
      const picker = await openPicker(1)

      await user.click(within(picker).getByRole('button', { name: named('Add a new member') }))
      await findSheet('Add a new member')

      await waitFor(async () => expect(await isPushed('Add a member')).toBe(true))
      expect(await isPushed('Add a new member')).toBe(false)
    })
  })
})
