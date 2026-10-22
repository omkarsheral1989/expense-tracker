// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { groups } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { groupService } from '../../../services/groupService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { createTestGroup, ensurePersonId, type TestGroupInput } from '../../../testing/groups.ts'
import { personIdForEmail } from '../../../testing/ids.ts'
import { renderPage } from '../../../testing/render.tsx'
import { EditGroupPage } from '../index.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar' }
const priya = { email: 'priya@gmail.com', name: 'Priya' }
const myId = personIdForEmail(me.email)
const testDb = setUpTestDatabase()

async function createGroup(
  creator: { email: string; name: string },
  input: Partial<TestGroupInput> & { name: string },
) {
  const result = await createTestGroup(testDb.db, creator, {
    type: 'trip',
    defaultCurrency: 'GBP',
    memberEmails: [],
    ...input,
  })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.groupId
}

function renderEdit(groupId: string) {
  return renderPage(<EditGroupPage />, {
    path: ROUTES.editGroup(groupId),
    pattern: ROUTES.editGroupPattern,
    routes: [ROUTES.home, ROUTES.group(groupId)],
  })
}

async function savedGroup(groupId: string) {
  const [row] = await testDb.db.select().from(groups).where(eq(groups.id, groupId))
  return row
}

const nameInput = () => screen.getByRole('textbox', { name: 'Group name' })
const currencyInput = () => screen.getByRole('combobox', { name: 'Default currency' })
const saveButton = () => screen.getByRole('button', { name: 'Save' })

describe('EditGroupPage', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(async () => {
    user = userEvent.setup()
    useAuthStore.setState({ profile: me, token: null })
    await ensurePersonId(testDb.db, me.email, me.name)
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.mocked(getDb).mockClear()
  })

  describe('when it opens', () => {
    it('has a quiet header title beside Back: a level 3 heading of 32 px, thin and in capitals, and an outlined Back button', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderEdit(id)
      const title = await screen.findByRole('heading', { name: 'Edit group', level: 3 })
      expect(title).toHaveStyle({ fontSize: '32px', fontWeight: '100', lineHeight: '40px', textTransform: 'uppercase' })
      expect(title.parentElement).toContainElement(screen.getByRole('button', { name: 'Back' }))
      // Back is an outlined circle like the Delete button, not a bare icon.
      expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('ant-btn-variant-outlined')
    })

    it('is filled in with the group\'s name, type and default currency, and has no members field', async () => {
      const id = await createGroup(me, { name: 'Goa trip', type: 'couple', defaultCurrency: 'EUR' })
      renderEdit(id)

      expect(await screen.findByRole('heading', { name: 'Edit group' })).toBeInTheDocument()
      expect(nameInput()).toHaveValue('Goa trip')
      expect(screen.getByRole('radio', { name: /couple/i })).toBeChecked()
      expect(screen.getByRole('radio', { name: /trip/i })).not.toBeChecked()
      expect(within(screen.getByText('Default currency', { selector: 'label' }).closest('.ant-form-item') as HTMLElement).getByText(/EUR – Euro/)).toBeInTheDocument()
      expect(screen.queryByText('Members')).not.toBeInTheDocument()
    })

    it('washes the page with a faint color of the group\'s type, and changes it with the type', async () => {
      const id = await createGroup(me, { name: 'Flat', type: 'couple' })
      renderEdit(id)
      const wash = () =>
        (document.querySelector('div[aria-hidden="true"][style*="fixed"]') as HTMLElement).style.backgroundColor
      await screen.findByRole('heading', { name: 'Edit group' })
      expect(wash()).toContain('rgb(196, 29, 127)')

      await user.click(screen.getByText('Home'))
      expect(wash()).toContain('rgb(212, 107, 8)')
    })

    it('says in its tab title that the group is being edited', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderEdit(id)

      await screen.findByRole('heading', { name: 'Edit group' })
      await waitFor(() => expect(document.title).toBe('Edit group · OwnLedger'))
    })

    it('shows grey placeholders while the group loads', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderEdit(id)

      expect(screen.getByRole('status', { name: 'Loading the group' })).toBeInTheDocument()
      await screen.findByRole('heading', { name: 'Edit group' })
    })

    it('shows "Group not found" for an unknown group, a group of other people, and a deleted one', async () => {
      const others = await createGroup(priya, { name: 'Flat' })
      const deleted = await createGroup(me, { name: 'Old' })
      await testDb.db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, deleted))

      for (const id of [crypto.randomUUID(), others, deleted]) {
        const page = renderEdit(id)
        expect(await screen.findByText('Group not found')).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: 'Edit group' })).not.toBeInTheDocument()
        page.unmount()
      }
    })

    it('says it could not load, and loads again on "Try again"', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))
      renderEdit(id)

      expect(await screen.findByText("Couldn't load this group")).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Try again' }))

      expect(await screen.findByRole('heading', { name: 'Edit group' })).toBeInTheDocument()
      expect(nameInput()).toHaveValue('Goa trip')
    })
  })

  describe('saving', () => {
    it('saves a new name, type and currency, says so, and goes back to the group', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderEdit(id)
      await screen.findByRole('heading', { name: 'Edit group' })

      await user.clear(nameInput())
      await user.type(nameInput(), 'Flat bills')
      await user.click(screen.getByText('Home'))
      await user.click(currencyInput())
      await user.type(currencyInput(), 'euro')
      await user.click(await screen.findByText(/EUR – Euro/, { selector: '.ant-select-item-option-content' }))
      await user.click(saveButton())

      expect(await screen.findByText('Group updated.')).toBeInTheDocument()
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
      expect(await savedGroup(id)).toMatchObject({ name: 'Flat bills', type: 'home', defaultCurrency: 'EUR', updatedBy: myId })
    })

    it('lets another member save it', async () => {
      const id = await createGroup(priya, { name: 'Goa trip', memberEmails: [me.email] })
      renderEdit(id)
      await screen.findByRole('heading', { name: 'Edit group' })

      await user.type(nameInput(), ' 2')
      await user.click(saveButton())

      await waitFor(async () => expect((await savedGroup(id)).name).toBe('Goa trip 2'))
    })

    it('shows the problems beside their fields when Save is pressed, and keeps what was typed', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderEdit(id)
      await screen.findByRole('heading', { name: 'Edit group' })

      await user.clear(nameInput())
      await user.click(saveButton())

      expect(await screen.findByText('Enter a group name.')).toBeInTheDocument()
      expect(page.currentPath()).toBe(ROUTES.editGroup(id))
      expect((await savedGroup(id)).name).toBe('Goa trip')
      // The message goes as soon as the field is edited.
      await user.type(nameInput(), 'x')
      await waitFor(() => expect(screen.queryByText('Enter a group name.')).not.toBeInTheDocument())
    })

    it('names the other group when the name is taken, ignoring case and extra spaces, and does not leave', async () => {
      await createGroup(me, { name: 'Flat bills' })
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderEdit(id)
      await screen.findByRole('heading', { name: 'Edit group' })

      await user.clear(nameInput())
      await user.type(nameInput(), '  flat   BILLS ')
      await user.click(saveButton())

      expect(await screen.findByText('You already have a group called Flat bills.')).toBeInTheDocument()
      expect(page.currentPath()).toBe(ROUTES.editGroup(id))
      expect((await savedGroup(id)).name).toBe('Goa trip')
    })

    it('does not call the name taken when it is only the group\'s own name in another case', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderEdit(id)
      await screen.findByRole('heading', { name: 'Edit group' })

      await user.clear(nameInput())
      await user.type(nameInput(), 'GOA TRIP')
      await user.click(saveButton())

      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
      expect((await savedGroup(id)).name).toBe('GOA TRIP')
    })

    it('just goes back when nothing was changed, saving nothing', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const before = await savedGroup(id)
      const update = vi.spyOn(groupService, 'updateGroup')
      const page = renderEdit(id)
      await screen.findByRole('heading', { name: 'Edit group' })

      await user.click(saveButton())

      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
      expect(update).not.toHaveBeenCalled()
      expect((await savedGroup(id)).updatedAt).toEqual(before.updatedAt)
      expect(screen.queryByText('Group updated.')).not.toBeInTheDocument()
    })

    it('says so and stays on the form when saving fails, and saves on a second try', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderEdit(id)
      await screen.findByRole('heading', { name: 'Edit group' })
      await user.type(nameInput(), ' 2')
      vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))

      await user.click(saveButton())

      expect(await screen.findByText("Couldn't save the changes. Please try again.")).toBeInTheDocument()
      expect(page.currentPath()).toBe(ROUTES.editGroup(id))
      expect(nameInput()).toHaveValue('Goa trip 2')
      expect((await savedGroup(id)).name).toBe('Goa trip')

      await user.click(saveButton())
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
      expect((await savedGroup(id)).name).toBe('Goa trip 2')
    })

    it('sends the user home when the group was deleted while the form was open', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderEdit(id)
      await screen.findByRole('heading', { name: 'Edit group' })
      await user.type(nameInput(), ' 2')
      await testDb.db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, id))

      await user.click(saveButton())

      expect(await screen.findByText('This group is no longer available.')).toBeInTheDocument()
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.home))
    })
  })

  describe('leaving', () => {
    it.each(['Back', 'Cancel'])('"%s" goes straight back to the group while nothing is changed', async (label) => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderEdit(id)
      await screen.findByRole('heading', { name: 'Edit group' })

      await user.click(screen.getByRole('button', { name: label }))

      expect(page.currentPath()).toBe(ROUTES.group(id))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does not count spaces around the name as a change', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderEdit(id)
      await screen.findByRole('heading', { name: 'Edit group' })

      await user.type(nameInput(), '   ')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(page.currentPath()).toBe(ROUTES.group(id))
    })

    it.each([
      ['the name is changed', async (user: ReturnType<typeof userEvent.setup>) => user.type(nameInput(), '2')],
      ['the type is changed', async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByText('Couple'))],
    ])('asks "Discard your changes?" once %s', async (_what, change) => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderEdit(id)
      await screen.findByRole('heading', { name: 'Edit group' })
      await change(user)

      await user.click(screen.getByRole('button', { name: 'Back' }))

      const dialog = await screen.findByRole('dialog', { name: 'Discard your changes?' })
      expect(within(dialog).getByText('What you changed will be lost.')).toBeInTheDocument()
      expect(page.currentPath()).toBe(ROUTES.editGroup(id))
    })

    it('stays on the form, keeping the changes, on "Keep editing"', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderEdit(id)
      await screen.findByRole('heading', { name: 'Edit group' })
      await user.type(nameInput(), ' 2')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await user.click(await screen.findByRole('button', { name: 'Keep editing' }))

      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Discard your changes?' })).not.toBeInTheDocument(),
      )
      expect(page.currentPath()).toBe(ROUTES.editGroup(id))
      expect(nameInput()).toHaveValue('Goa trip 2')
    })

    it('goes back to the group on "Discard", without saving anything', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderEdit(id)
      await screen.findByRole('heading', { name: 'Edit group' })
      await user.type(nameInput(), ' 2')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await user.click(await screen.findByRole('button', { name: 'Discard' }))

      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
      expect((await savedGroup(id)).name).toBe('Goa trip')
    })

    it('warns before the tab is reloaded or closed, only while something is changed', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderEdit(id)
      await screen.findByRole('heading', { name: 'Edit group' })
      const tryToLeave = () => {
        const event = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(event)
        return event.defaultPrevented
      }

      expect(tryToLeave()).toBe(false)
      await user.type(nameInput(), ' 2')
      expect(tryToLeave()).toBe(true)
    })
  })
})
