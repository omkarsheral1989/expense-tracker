// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { groupService } from '../../../services/groupService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { renderPage } from '../../../testing/render.tsx'
import { CreateGroupPage } from '../index.tsx'
import { addTestPerson, createTestGroup, ensurePersonId } from '../../../testing/groups.ts'
import { personIdForEmail } from '../../../testing/ids.ts'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar' }
const testDb = setUpTestDatabase()

/** Pretend the browser's languages are these, so the region (and currency) is known. */
function setLanguages(languages: string[]) {
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(languages)
}

function renderForm() {
  return renderPage(<CreateGroupPage />, {
    path: ROUTES.newGroup,
    routes: [ROUTES.home, ROUTES.groupPattern],
  })
}

/** The form row with this label, to look for what sits beside that field. */
function field(label: string) {
  return screen
    .getByText(label, { selector: 'label' })
    .closest('.ant-form-item') as HTMLElement
}

/** The addresses and names currently chosen in the Members field. */
function chosenMembers() {
  return [...field('Members').querySelectorAll('.ant-select-selection-item')].map(
    (item) => item.textContent,
  )
}

/**
 * The labels of the entries of the open dropdown, as seen on screen. (The
 * `option` roles are a hidden copy for screen readers that shows only values.)
 */
function visibleOptions() {
  return [...document.querySelectorAll('.ant-select-item-option-content')].map(
    (option) => option.textContent ?? '',
  )
}

/** Opens the Members list. */
async function openMembers(user: ReturnType<typeof userEvent.setup>) {
  await user.click(membersInput())
  await screen.findByRole('button', { name: /Add a new member/ })
}

/** Picks a person already saved on the device, by the name (or address) shown for them. */
async function pickMember(user: ReturnType<typeof userEvent.setup>, label: string) {
  await openMembers(user)
  await user.click(await screen.findByText(label, { selector: '.ant-select-item-option-content *' }))
}

/** Opens the "Add a new member" dialog from the Members list. */
async function openAddMemberDialog(user: ReturnType<typeof userEvent.setup>) {
  await openMembers(user)
  await user.click(screen.getByRole('button', { name: /Add a new member/ }))
  return screen.findByRole('dialog', { name: 'Add a new member' })
}

/** Fills in the "Add a new member" dialog and presses Add. */
async function addNewMember(
  user: ReturnType<typeof userEvent.setup>,
  { name, email }: { name: string; email?: string },
) {
  const dialog = await openAddMemberDialog(user)
  if (name) await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), name)
  if (email) await user.type(within(dialog).getByRole('textbox', { name: 'Email (optional)' }), email)
  await user.click(within(dialog).getByRole('button', { name: 'Add' }))
  return dialog
}

const nameInput = () => screen.getByRole('textbox', { name: 'Group name' })
const membersInput = () => screen.getByRole('combobox', { name: 'Members' })
const currencyInput = () => screen.getByRole('combobox', { name: 'Default currency' })
const createButton = () => screen.getByRole('button', { name: 'Create group' })

describe('CreateGroupPage', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(async () => {
    user = userEvent.setup()
    useAuthStore.setState({ profile: me, token: null })
    // The gate saves the user's own person when the app opens; a page test does it itself.
    await ensurePersonId(testDb.db, me.email, me.name)
    setLanguages(['en-IN'])
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.mocked(getDb).mockClear()
  })

  describe('when it opens', () => {
    it('has a quiet header title beside Back: a level 3 heading of 20 px and light weight, and an outlined Back button', async () => {
      renderForm()
      const title = await screen.findByRole('heading', { name: 'Create a group', level: 3 })
      expect(title).toHaveStyle({ fontSize: '20px', fontWeight: '300' })
      expect(title.parentElement).toContainElement(screen.getByRole('button', { name: 'Back' }))
      // Back is an outlined circle like the Delete button, not a bare icon.
      expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('ant-btn-variant-outlined')
    })

    it('has Trip selected, the region\'s currency chosen, and no name or members', async () => {
      renderForm()

      expect(nameInput()).toHaveValue('')
      expect(screen.getByRole('radio', { name: /trip/i })).toBeChecked()
      expect(screen.getByRole('radio', { name: /home/i })).not.toBeChecked()
      expect(within(field('Default currency')).getByText('INR – Indian Rupee (₹)')).toBeInTheDocument()
      expect(chosenMembers()).toEqual([])
    })

    it('chooses no currency when the region is not known', async () => {
      setLanguages(['xx'])
      renderForm()

      expect(within(field('Default currency')).queryByText(/–/)).not.toBeInTheDocument()
    })

    it('is titled "Create a group · OwnLedger"', async () => {
      renderForm()
      await waitFor(() => expect(document.title).toBe('Create a group · OwnLedger'))
    })
  })

  describe('pressing Create', () => {
    it('shows every problem at once, each beside its own field', async () => {
      setLanguages(['xx']) // no currency preselected
      renderForm()

      await user.click(createButton())

      expect(await within(field('Group name')).findByText('Enter a group name.')).toBeInTheDocument()
      expect(within(field('Default currency')).getByText('Choose a currency.')).toBeInTheDocument()
      // Nothing was saved.
      expect(await groupService.listGroups(testDb.db, personIdForEmail(me.email))).toEqual([])
    })

    it('makes a message disappear as soon as its field is edited', async () => {
      renderForm()
      await user.click(createButton())
      expect(await screen.findByText('Enter a group name.')).toBeInTheDocument()

      await user.type(nameInput(), 'G')

      await waitFor(() =>
        expect(screen.queryByText('Enter a group name.')).not.toBeInTheDocument(),
      )
    })

    it('refuses a name over 60 characters', async () => {
      renderForm()
      await user.type(nameInput(), 'x'.repeat(61))
      await user.click(createButton())

      expect(await screen.findByText('Use at most 60 characters.')).toBeInTheDocument()
    })

    it('refuses a name that another of your groups already has, naming that group', async () => {
      const first = await createTestGroup(testDb.db, me, {
        name: 'Goa trip',
        type: 'trip',
        defaultCurrency: 'GBP',
        memberEmails: [],
      })
      expect(first.ok).toBe(true)
      renderForm()

      await user.type(nameInput(), '  goa   TRIP ')
      await user.click(createButton())

      expect(
        await within(field('Group name')).findByText('You already have a group called Goa trip.'),
      ).toBeInTheDocument()
      expect(await groupService.listGroups(testDb.db, personIdForEmail(me.email))).toHaveLength(1)
    })
  })

  describe('the Members field', () => {
    async function saveSomePeople() {
      await createTestGroup(testDb.db, me, {
        name: 'Goa',
        type: 'trip',
        defaultCurrency: 'GBP',
        memberEmails: ['priya@gmail.com', 'sam@gmail.com'],
      })
      await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
    }

    it('lists the people saved on this device, by name when known, and never you', async () => {
      await saveSomePeople()
      renderForm()

      await openMembers(user)

      const listed = visibleOptions().join(' | ')
      expect(listed).toContain('Priya Shah')
      expect(listed).toContain('priya@gmail.com')
      expect(listed).toContain('sam@gmail.com')
      expect(listed).not.toContain('omkar@gmail.com')
    })

    it('shows "No email" for a person saved without one', async () => {
      await addTestPerson(testDb.db, me, { name: 'Rahul' })
      renderForm()

      await openMembers(user)

      expect(visibleOptions()).toEqual(['RahulNo email'])
    })

    it('adds a person from the list, shown by their name', async () => {
      await saveSomePeople()
      renderForm()

      await pickMember(user, 'Priya Shah')

      expect(chosenMembers()).toEqual(['Priya Shah'])
    })

    it('removes a chosen person with their x, and only that one', async () => {
      await saveSomePeople()
      renderForm()
      await pickMember(user, 'Priya Shah')
      await pickMember(user, 'sam@gmail.com')
      expect(chosenMembers()).toEqual(['Priya Shah', 'sam@gmail.com'])

      const priyaTag = screen.getByText('Priya Shah', { selector: '.ant-select-selection-item *' }).closest('.ant-select-selection-item') as HTMLElement
      // The x is hidden from screen readers (they use Backspace), so it is found by class.
      await user.click(priyaTag.querySelector('.ant-select-selection-item-remove') as HTMLElement)

      expect(chosenMembers()).toEqual(['sam@gmail.com'])
    })

    it('only searches when typing: a typed address is never added', async () => {
      await saveSomePeople()
      renderForm()

      await user.type(membersInput(), 'bob@gmail.com')
      expect(visibleOptions()).toEqual([])
      const enter = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }
      fireEvent.keyDown(membersInput(), enter)
      fireEvent.keyUp(membersInput(), enter)
      // A comma or a pasted list adds nobody either.
      await user.type(membersInput(), ', ann@gmail.com')
      await user.paste('cy@gmail.com; di@gmail.com')

      expect(chosenMembers()).toEqual([])
      // Only the creator and the two saved people exist.
      expect(await testDb.db.select().from(people)).toHaveLength(3)
    })

    it('finds a person by name or by address', async () => {
      await saveSomePeople()
      renderForm()

      await user.type(membersInput(), 'shah')
      expect(visibleOptions()).toEqual(['Priya Shahpriya@gmail.com'])
    })

    it('has "Add a new member" as the last row, also when nobody matches the search', async () => {
      await saveSomePeople()
      renderForm()

      await user.type(membersInput(), 'zzzz')

      expect(await screen.findByText('No one matches.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Add a new member/ })).toBeInTheDocument()
    })

    describe('the "Add a new member" dialog', () => {
      it('asks for a name and an optional email', async () => {
        renderForm()

        const dialog = await openAddMemberDialog(user)

        expect(within(dialog).getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
        expect(within(dialog).getByRole('textbox', { name: 'Email (optional)' })).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Add' })).toBeInTheDocument()
      })

      it('adds a person with just a name, chooses them, and saves them on this device at once', async () => {
        renderForm()

        await addNewMember(user, { name: 'Rahul' })

        await waitFor(() => expect(chosenMembers()).toEqual(['Rahul']))
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add a new member' })).not.toBeInTheDocument())
        // Saved before any group is created.
        const [rahul] = await testDb.db.select().from(people).where(eq(people.name, 'Rahul'))
        expect(rahul.email).toBeNull()
        expect(await groupService.listGroups(testDb.db, personIdForEmail(me.email))).toEqual([])
      })

      it('adds a person with a Gmail address, tidied up', async () => {
        renderForm()

        await addNewMember(user, { name: '  Priya   Shah ', email: ' Priya@Gmail.com ' })

        await waitFor(() => expect(chosenMembers()).toEqual(['Priya Shah']))
        const [priya] = await testDb.db.select().from(people).where(eq(people.name, 'Priya Shah'))
        expect(priya.email).toBe('priya@gmail.com')
      })

      it('lists the new person for the next group, even if this one is never created', async () => {
        const first = renderForm()
        await addNewMember(user, { name: 'Rahul' })
        await waitFor(() => expect(chosenMembers()).toEqual(['Rahul']))
        first.unmount()
        cleanup()

        renderForm()
        await openMembers(user)

        expect(visibleOptions()).toEqual(['RahulNo email'])
      })

      it('asks for a name', async () => {
        renderForm()

        const dialog = await addNewMember(user, { name: '' })

        expect(await within(dialog).findByText('Enter a name.')).toBeInTheDocument()
        expect(chosenMembers()).toEqual([])
      })

      it('refuses an email that is not a Gmail address', async () => {
        renderForm()

        const dialog = await addNewMember(user, { name: 'Bob', email: 'bob@yahoo.com' })

        expect(await within(dialog).findByText('Only @gmail.com addresses can be added.')).toBeInTheDocument()
        expect(await testDb.db.select().from(people).where(eq(people.name, 'Bob'))).toEqual([])
      })

      it('refuses an email someone on this device already has, naming them', async () => {
        await createTestGroup(testDb.db, me, {
          name: 'Goa', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'],
        })
        await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
        renderForm()

        const dialog = await addNewMember(user, { name: 'Another Priya', email: 'PRIYA@gmail.com' })

        expect(
          await within(dialog).findByText('Priya Shah is already in your list with this email.'),
        ).toBeInTheDocument()
      })

      it('refuses your own address, since you are added automatically', async () => {
        renderForm()

        const dialog = await addNewMember(user, { name: 'Me again', email: 'omkar@gmail.com' })

        expect(
          await within(dialog).findByText('That is your own address. You are added automatically.'),
        ).toBeInTheDocument()
      })

      it('refuses a name someone on this device already has, ignoring case and extra spaces', async () => {
        await addTestPerson(testDb.db, me, { name: 'Sam Lee' })
        renderForm()

        const dialog = await addNewMember(user, { name: ' sam   LEE ' })

        expect(await within(dialog).findByText('You already have someone called Sam Lee.')).toBeInTheDocument()
        expect(await testDb.db.select().from(people).where(eq(people.name, 'sam LEE'))).toEqual([])
      })

      it('shows every problem at once, and each disappears when its field is edited', async () => {
        await addTestPerson(testDb.db, me, { name: 'Sam', email: 'sam@gmail.com' })
        renderForm()
        const dialog = await addNewMember(user, { name: 'sam', email: 'sam@gmail.com' })
        expect(await within(dialog).findByText('You already have someone called Sam.')).toBeInTheDocument()
        expect(within(dialog).getByText('Sam is already in your list with this email.')).toBeInTheDocument()

        await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'x')

        await waitFor(() =>
          expect(within(dialog).queryByText('You already have someone called Sam.')).not.toBeInTheDocument(),
        )
        expect(within(dialog).getByText('Sam is already in your list with this email.')).toBeInTheDocument()
      })

      it('adds nobody on Cancel, and starts empty the next time', async () => {
        renderForm()
        const dialog = await openAddMemberDialog(user)
        await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Rahul')

        await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add a new member' })).not.toBeInTheDocument())
        expect(chosenMembers()).toEqual([])
        expect(await testDb.db.select().from(people).where(eq(people.name, 'Rahul'))).toEqual([])

        const again = await openAddMemberDialog(user)
        expect(within(again).getByRole('textbox', { name: 'Name' })).toHaveValue('')
      })

      it('says so and keeps the dialog open when saving fails', async () => {
        renderForm()
        const dialog = await openAddMemberDialog(user)
        await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Rahul')
        vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))

        await user.click(within(dialog).getByRole('button', { name: 'Add' }))

        expect(await screen.findByText("Couldn't add the member. Please try again.")).toBeInTheDocument()
        expect(screen.getByRole('dialog', { name: 'Add a new member' })).toBeInTheDocument()
      })
    })
  })

  describe('the Default currency field', () => {
    it('lists the region\'s currency first and the rest A to Z', async () => {
      renderForm()
      await user.click(currencyInput())

      await waitFor(() => expect(visibleOptions().length).toBeGreaterThan(1))
      const labels = visibleOptions()
      expect(labels[0]).toBe('INR – Indian Rupee (₹)')
      expect(labels[1]).toMatch(/^AED/)
    })

    it('finds a currency by its name or its code', async () => {
      renderForm()
      await user.click(currencyInput())

      await user.type(currencyInput(), 'euro')
      expect(await screen.findByText(/EUR – Euro/, { selector: '.ant-select-item-option-content' })).toBeInTheDocument()
      expect(visibleOptions().some((label) => label.startsWith('USD'))).toBe(false)

      // The code works too.
      await user.clear(currencyInput())
      await user.type(currencyInput(), 'gbp')
      expect(await screen.findByText(/GBP – British Pound/, { selector: '.ant-select-item-option-content' })).toBeInTheDocument()
    })

    it('uses the currency picked from the list', async () => {
      renderForm()
      await user.click(currencyInput())
      await user.type(currencyInput(), 'euro')
      await user.click(await screen.findByText(/EUR – Euro/, { selector: '.ant-select-item-option-content' }))
      expect(within(field('Default currency')).getAllByText(/EUR – Euro/).length).toBeGreaterThan(0)

      await user.type(nameInput(), 'Berlin')
      await user.click(createButton())

      await waitFor(async () => {
        const [group] = await groupService.listGroups(testDb.db, personIdForEmail(me.email))
        expect(group).toMatchObject({ name: 'Berlin', defaultCurrency: 'EUR' })
      })
    })
  })

  describe('creating the group', () => {
    it('saves it with the chosen type, currency and members, then opens the new group\'s page', async () => {
      await addTestPerson(testDb.db, me, { name: 'Priya Shah', email: 'priya@gmail.com' })
      const page = renderForm()
      await user.type(nameInput(), 'Goa trip')
      await user.click(screen.getByText('Home'))
      await pickMember(user, 'Priya Shah')
      await addNewMember(user, { name: 'Rahul' })
      await waitFor(() => expect(chosenMembers()).toEqual(['Priya Shah', 'Rahul']))

      await user.click(createButton())

      expect(await screen.findByText('Group created.')).toBeInTheDocument()

      const [group] = await groupService.listGroups(testDb.db, personIdForEmail(me.email))
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(group.id)))
      expect(group).toMatchObject({ name: 'Goa trip', type: 'home', defaultCurrency: 'INR', memberCount: 3 })
      const details = await groupService.getGroup(testDb.db, personIdForEmail(me.email), group.id)
      expect(details?.members.map((member) => member.email)).toEqual([
        'omkar@gmail.com',
        'priya@gmail.com',
        null,
      ])
      expect(details?.members.map((member) => member.name)).toEqual(['Omkar', 'Priya Shah', 'Rahul'])
    })

    it('says so and stays on the form when saving fails, and can be tried again', async () => {
      const page = renderForm()
      await user.type(nameInput(), 'Goa trip')
      vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))

      await user.click(createButton())

      expect(await screen.findByText("Couldn't create the group. Please try again.")).toBeInTheDocument()
      expect(page.currentPath()).toBe(ROUTES.newGroup)
      expect(nameInput()).toHaveValue('Goa trip')

      await user.click(createButton())
      const [group] = await waitFor(async () => {
        const groups = await groupService.listGroups(testDb.db, personIdForEmail(me.email))
        expect(groups).toHaveLength(1)
        return groups
      })
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(group.id)))
    })
  })

  describe('leaving', () => {
    it('goes home at once from an untouched form, with Back or Cancel', async () => {
      const page = renderForm()
      await user.click(screen.getByRole('button', { name: 'Back' }))
      expect(page.currentPath()).toBe(ROUTES.home)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does not count spaces in the name as input', async () => {
      const page = renderForm()
      await user.type(nameInput(), '   ')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(page.currentPath()).toBe(ROUTES.home)
    })

    it.each([
      ['a name is typed', async (user: ReturnType<typeof userEvent.setup>) => user.type(nameInput(), 'Goa')],
      ['the type is changed', async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByText('Couple'))],
      ['a member is chosen', async (user: ReturnType<typeof userEvent.setup>) => pickMember(user, 'Priya')],
    ])('asks "Discard this group?" once %s', async (_description, change) => {
      await addTestPerson(testDb.db, me, { name: 'Priya' })
      const page = renderForm()
      await change(user)

      await user.click(screen.getByRole('button', { name: 'Back' }))

      const dialog = await screen.findByRole('dialog', { name: 'Discard this group?' })
      expect(within(dialog).getByText('What you entered will be lost.')).toBeInTheDocument()
      expect(page.currentPath()).toBe(ROUTES.newGroup)
    })

    it('stays on the form, keeping the input, on "Keep editing"', async () => {
      const page = renderForm()
      await user.type(nameInput(), 'Goa trip')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await user.click(await screen.findByRole('button', { name: 'Keep editing' }))

      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Discard this group?' })).not.toBeInTheDocument(),
      )
      expect(page.currentPath()).toBe(ROUTES.newGroup)
      expect(nameInput()).toHaveValue('Goa trip')
    })

    it('goes home on "Discard", without saving anything', async () => {
      const page = renderForm()
      await user.type(nameInput(), 'Goa trip')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await user.click(await screen.findByRole('button', { name: 'Discard' }))

      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.home))
      expect(await groupService.listGroups(testDb.db, personIdForEmail(me.email))).toEqual([])
    })

    it('warns before the tab is reloaded or closed, only while there is input', async () => {
      renderForm()
      const tryToLeave = () => {
        const event = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(event)
        return event.defaultPrevented
      }

      expect(tryToLeave()).toBe(false)
      await user.type(nameInput(), 'Goa')
      expect(tryToLeave()).toBe(true)
    })
  })
})
