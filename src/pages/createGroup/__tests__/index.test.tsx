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

/**
 * Types an address into the Members field and presses Enter. user-event's own
 * `{Enter}` is not understood by Ant Design's Select, so the key is sent as raw
 * key down and key up events with the Enter key code, as a browser sends them.
 */
async function addMember(user: ReturnType<typeof userEvent.setup>, address: string) {
  // Clicking an already focused field would close its dropdown, and Enter only
  // adds an address while the dropdown is open.
  await user.type(membersInput(), address, {
    skipClick: document.activeElement === membersInput(),
  })
  // Ant Design makes the typed address the active entry a moment after typing;
  // Enter only picks the active entry, and a person is never faster than that.
  await waitFor(() =>
    expect(
      document.querySelector('.ant-select-item-option-active .ant-select-item-option-content'),
    ).toHaveTextContent(address),
  )
  const enter = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }
  fireEvent.keyDown(membersInput(), enter)
  // Ant Design ignores further Enter presses until the key is released, as a
  // real key always is.
  fireEvent.keyUp(membersInput(), enter)
}

const nameInput = () => screen.getByRole('textbox', { name: 'Group name' })
const membersInput = () => screen.getByRole('combobox', { name: 'Members' })
const currencyInput = () => screen.getByRole('combobox', { name: 'Default currency' })
const createButton = () => screen.getByRole('button', { name: 'Create group' })

describe('CreateGroupPage', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    useAuthStore.setState({ profile: me, token: null })
    setLanguages(['en-IN'])
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.mocked(getDb).mockClear()
  })

  describe('when it opens', () => {
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
      await addMember(user, 'bob@yahoo.com')

      await user.click(createButton())

      expect(await within(field('Group name')).findByText('Enter a group name.')).toBeInTheDocument()
      expect(within(field('Default currency')).getByText('Choose a currency.')).toBeInTheDocument()
      expect(
        within(field('Members')).getByText('Only @gmail.com addresses can be added: bob@yahoo.com'),
      ).toBeInTheDocument()
      // Nothing was saved.
      expect(await groupService.listGroups(testDb.db, me.email)).toEqual([])
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
      const first = await groupService.createGroup(testDb.db, me, {
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
      expect(await groupService.listGroups(testDb.db, me.email)).toHaveLength(1)
    })
  })

  describe('the Members field', () => {
    it('adds a typed address, lower-cased', async () => {
      renderForm()
      await addMember(user, 'Priya@Gmail.com')
      expect(chosenMembers()).toEqual(['priya@gmail.com'])
    })

    it('ignores the same address typed again, in any case', async () => {
      renderForm()
      await addMember(user, 'priya@gmail.com')
      expect(chosenMembers()).toEqual(['priya@gmail.com'])

      // Typing an address that is already chosen would, by default, untick it.
      await addMember(user, 'priya@gmail.com')
      expect(chosenMembers()).toEqual(['priya@gmail.com'])

      await addMember(user, 'PRIYA@gmail.com')
      expect(chosenMembers()).toEqual(['priya@gmail.com'])
    })

    it('ignores your own address, with a short notice', async () => {
      renderForm()
      await addMember(user, 'Omkar@gmail.com')

      expect(chosenMembers()).toEqual([])
      expect(await screen.findByText('You are added to the group automatically.')).toBeInTheDocument()
    })

    it('adds addresses one after another with Enter', async () => {
      renderForm()
      await addMember(user, 'priya@gmail.com')
      await addMember(user, 'sam@gmail.com')
      expect(chosenMembers()).toEqual(['priya@gmail.com', 'sam@gmail.com'])
    })

    it('adds several addresses pasted at once, tidied up', async () => {
      renderForm()
      await user.click(membersInput())
      await user.paste('Priya@Gmail.com, sam@gmail.com; priya@gmail.com')

      expect(chosenMembers()).toEqual(['priya@gmail.com', 'sam@gmail.com'])
    })

    it('adds an address when a comma is typed after it', async () => {
      renderForm()
      await user.type(membersInput(), 'priya@gmail.com,')
      expect(chosenMembers()).toEqual(['priya@gmail.com'])
    })

    it('removes an address with its x, and only that one', async () => {
      renderForm()
      await user.click(membersInput())
      await user.paste('priya@gmail.com, sam@gmail.com')
      expect(chosenMembers()).toEqual(['priya@gmail.com', 'sam@gmail.com'])

      const priyaTag = screen.getByText('priya@gmail.com').closest('.ant-select-selection-item') as HTMLElement
      // The x is hidden from screen readers (they use Backspace), so it is found by class.
      await user.click(priyaTag.querySelector('.ant-select-selection-item-remove') as HTMLElement)

      expect(chosenMembers()).toEqual(['sam@gmail.com'])
    })

    it('suggests people from your other groups, by name when known, and never you', async () => {
      await groupService.createGroup(testDb.db, me, {
        name: 'Goa',
        type: 'trip',
        defaultCurrency: 'GBP',
        memberEmails: ['priya@gmail.com', 'sam@gmail.com'],
      })
      await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
      renderForm()

      await user.click(membersInput())

      await screen.findByText('Priya Shah', { selector: '.ant-select-item-option-content *' })
      const listed = visibleOptions().join(' | ')
      expect(listed).toContain('Priya Shah')
      expect(listed).toContain('priya@gmail.com')
      expect(listed).toContain('sam@gmail.com')
      expect(listed).not.toContain('omkar@gmail.com')
    })

    it('adds a suggested person, shown by their name', async () => {
      await groupService.createGroup(testDb.db, me, {
        name: 'Goa',
        type: 'trip',
        defaultCurrency: 'GBP',
        memberEmails: ['priya@gmail.com'],
      })
      await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
      renderForm()

      await user.click(membersInput())
      await user.click(await screen.findByText('Priya Shah', { selector: '.ant-select-item-option-content *' }))

      expect(chosenMembers()).toEqual(['Priya Shah'])
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
        const [group] = await groupService.listGroups(testDb.db, me.email)
        expect(group).toMatchObject({ name: 'Berlin', defaultCurrency: 'EUR' })
      })
    })
  })

  describe('creating the group', () => {
    it('saves it with the chosen type, currency and members, then opens the new group\'s page', async () => {
      const page = renderForm()
      await user.type(nameInput(), 'Goa trip')
      await user.click(screen.getByText('Home'))
      await user.click(membersInput())
      await user.paste('priya@gmail.com, sam@gmail.com')

      await user.click(createButton())

      expect(await screen.findByText('Group created.')).toBeInTheDocument()

      const [group] = await groupService.listGroups(testDb.db, me.email)
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(group.id)))
      expect(group).toMatchObject({ name: 'Goa trip', type: 'home', defaultCurrency: 'INR', memberCount: 3 })
      const details = await groupService.getGroup(testDb.db, me.email, group.id)
      expect(details?.members.map((member) => member.email)).toEqual([
        'omkar@gmail.com',
        'priya@gmail.com',
        'sam@gmail.com',
      ])
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
        const groups = await groupService.listGroups(testDb.db, me.email)
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
      ['a member is added', async (user: ReturnType<typeof userEvent.setup>) => addMember(user, 'priya@gmail.com')],
    ])('asks "Discard this group?" once %s', async (_description, change) => {
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
      expect(await groupService.listGroups(testDb.db, me.email)).toEqual([])
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
