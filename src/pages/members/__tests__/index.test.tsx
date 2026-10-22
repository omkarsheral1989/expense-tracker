// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groupMembers, people, syncStatus } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { personService } from '../../../services/personService'
import { addTestPerson, createTestGroup } from '../../../testing/groups.ts'
import { card, me, renderMembers, setUpMembersTests } from './helpers.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const { testDb, setUpUser } = setUpMembersTests()

beforeEach(setUpUser)
afterEach(cleanup)

describe('the Group members page', () => {
  it('has a Back button to the home page, the heading, and a tab title', async () => {
    const page = renderMembers()

    const heading = await screen.findByRole('heading', { name: 'Group members' })
    expect(heading).toHaveStyle({ fontSize: '20px', fontWeight: '300' })
    await waitFor(() => expect(document.title).toBe('Group members · OwnLedger'))

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(page.currentPath()).toBe(ROUTES.home)
  })

  it('says so when nobody is saved yet, and still offers Add member', async () => {
    renderMembers()

    expect(await screen.findByText('No members yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add member$/ })).toBeInTheDocument()
  })

  it('lists everyone but the user, A to Z by the name shown, with the email or "No email"', async () => {
    await addTestPerson(testDb.db, me, { name: 'Zoe', email: 'zoe@gmail.com' })
    await addTestPerson(testDb.db, me, { name: 'Sam' })
    const alan = await addTestPerson(testDb.db, me, { name: 'Alan', email: 'alan@gmail.com' })
    await testDb.db.update(people).set({ name: null }).where(eq(people.id, alan))
    renderMembers()

    await screen.findByRole('button', { name: 'Edit Sam' })
    const cards = screen.getAllByRole('button', { name: /^Edit / })
    expect(cards.map((entry) => entry.getAttribute('aria-label'))).toEqual(['Edit alan@gmail.com', 'Edit Sam', 'Edit Zoe'])
    expect(within(card('Sam')).getByText('No email')).toBeInTheDocument()
    expect(within(card('Zoe')).getByText('zoe@gmail.com')).toBeInTheDocument()
    // Without a name the email stands in for it, once.
    expect(within(card('alan@gmail.com')).getAllByText('alan@gmail.com')).toHaveLength(1)
    expect(screen.queryByText('Omkar Sheral')).not.toBeInTheDocument()
  })

  it('shows the name this device uses for a person instead of their shared name', async () => {
    const sam = await addTestPerson(testDb.db, me, { name: 'Sam' })
    await testDb.db.update(people).set({ localName: 'Cousin Sam' }).where(eq(people.id, sam))
    renderMembers()

    expect(await screen.findByRole('button', { name: 'Edit Cousin Sam' })).toBeInTheDocument()
    expect(screen.queryByText('Sam')).not.toBeInTheDocument()
  })

  it('is a card per person, with no pencil button, and tags Pending only until they have synced', async () => {
    await addTestPerson(testDb.db, me, { name: 'Sam' })
    const priya = await addTestPerson(testDb.db, me, { name: 'Priya', email: 'priya@gmail.com' })
    await testDb.db.insert(syncStatus).values({ scope: `member:some-group:${priya}`, lastSyncedAt: new Date() })
    renderMembers()

    await screen.findByRole('button', { name: 'Edit Sam' })
    expect(within(card('Sam')).getByText('Pending')).toBeInTheDocument()
    expect(within(card('Priya')).queryByText('Pending')).not.toBeInTheDocument()
    expect(document.querySelector('.anticon-edit')).toBeNull()
    expect(document.querySelectorAll('.ant-card')).toHaveLength(2)
  })

  it('shows a Google picture where a person has one and the initial where not', async () => {
    const sam = await addTestPerson(testDb.db, me, { name: 'Sam' })
    await testDb.db.update(people).set({ picture: 'https://example.com/sam.png' }).where(eq(people.id, sam))
    await addTestPerson(testDb.db, me, { name: 'Zoe' })
    renderMembers()

    await screen.findByRole('button', { name: 'Edit Sam' })
    expect(card('Sam').querySelector('img')).toHaveAttribute('src', 'https://example.com/sam.png')
    expect(card('Sam').querySelector('img')).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(card('Zoe').querySelector('img')).toBeNull()
    expect(within(card('Zoe')).getByText('Z')).toBeInTheDocument()
  })

  it('says it could not load, and tries again', async () => {
    const failing = vi.spyOn(personService, 'listManaged').mockRejectedValueOnce(new Error('boom'))
    await addTestPerson(testDb.db, me, { name: 'Sam' })
    renderMembers()

    expect(await screen.findByText("Couldn't load your members")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('button', { name: 'Edit Sam' })).toBeInTheDocument()
    failing.mockRestore()
  })

  describe('Add member', () => {
    async function openAdd() {
      await userEvent.click(await screen.findByRole('button', { name: /Add member$/ }))
      return screen.findByRole('dialog', { name: 'Add a new member' })
    }

    it('saves a person on this device, in no group, and lists them', async () => {
      renderMembers()
      await openAdd()

      await userEvent.type(screen.getByLabelText('Name'), 'Rahul')
      await userEvent.click(screen.getByRole('button', { name: 'Add' }))

      expect(await screen.findByRole('button', { name: 'Edit Rahul' })).toBeInTheDocument()
      expect(screen.queryByText('No members yet.')).not.toBeInTheDocument()
      const [row] = await testDb.db.select().from(people).where(eq(people.name, 'Rahul'))
      expect(row).toMatchObject({ email: null })
      expect(await testDb.db.select().from(groupMembers)).toEqual([])
    })

    it('refuses a name that is already shown for someone, beside the field', async () => {
      const sam = await addTestPerson(testDb.db, me, { name: 'Sam' })
      await testDb.db.update(people).set({ localName: 'Cousin' }).where(eq(people.id, sam))
      renderMembers()
      await openAdd()

      await userEvent.type(screen.getByLabelText('Name'), 'cousin')
      await userEvent.click(screen.getByRole('button', { name: 'Add' }))

      expect(await screen.findByText('You already have someone called Cousin.')).toBeInTheDocument()
      expect(await testDb.db.select().from(people)).toHaveLength(2)
    })

    it('does not list a person added in a group any differently: they are in the list too', async () => {
      await createTestGroup(testDb.db, me, {
        name: 'Goa', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'],
      })
      renderMembers()

      expect(await screen.findByRole('button', { name: 'Edit priya@gmail.com' })).toBeInTheDocument()
    })
  })

  describe('the edit dialog', () => {
    async function openEdit(name: string) {
      await userEvent.click(await screen.findByRole('button', { name: `Edit ${name}` }))
      return screen.findByRole('dialog', { name: 'Edit member' })
    }
    const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }))

    it('opens with the name shown for the person, and the email while they are pending', async () => {
      await addTestPerson(testDb.db, me, { name: 'Sam', email: 'sam@gmail.com' })
      renderMembers()

      const dialog = await openEdit('Sam')

      expect(within(dialog).getByLabelText('Name')).toHaveValue('Sam')
      expect(within(dialog).getByLabelText('Email')).toHaveValue('sam@gmail.com')
    })

    it('gives a person a name only this device uses, shown at once and kept after reopening', async () => {
      await addTestPerson(testDb.db, me, { name: 'Sam' })
      renderMembers()
      const dialog = await openEdit('Sam')

      await userEvent.clear(within(dialog).getByLabelText('Name'))
      await userEvent.type(within(dialog).getByLabelText('Name'), 'Sam2')
      await save()

      expect(await screen.findByRole('button', { name: 'Edit Sam2' })).toBeInTheDocument()
      expect(await rowOf('Sam')).toMatchObject({ name: 'Sam', localName: 'Sam2' })

      // The sheet opens with what the person has now, not what it opened with before.
      const again = await openEdit('Sam2')
      expect(within(again).getByLabelText('Name')).toHaveValue('Sam2')
      await userEvent.clear(within(again).getByLabelText('Name'))
      await userEvent.type(within(again).getByLabelText('Name'), 'Sam3')
      await save()
      await screen.findByRole('button', { name: 'Edit Sam3' })
      const third = await openEdit('Sam3')
      expect(within(third).getByLabelText('Name')).toHaveValue('Sam3')
    })

    it('does not let the name be empty or blank, and stays open with the message beside the field', async () => {
      await addTestPerson(testDb.db, me, { name: 'Sam' })
      renderMembers()
      const dialog = await openEdit('Sam')

      await userEvent.clear(within(dialog).getByLabelText('Name'))
      await save()
      expect(await screen.findByText('Enter a name.')).toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Edit member' })).toBeInTheDocument()

      // The message goes when the field is edited, and a blank name is refused too.
      await userEvent.type(within(dialog).getByLabelText('Name'), '   ')
      await waitFor(() => expect(screen.queryByText('Enter a name.')).not.toBeInTheDocument())
      await save()
      expect(await screen.findByText('Enter a name.')).toBeInTheDocument()
      expect((await testDb.db.select().from(people).where(eq(people.name, 'Sam')))[0].localName).toBeNull()
    })

    it('says which person already has that name', async () => {
      await addTestPerson(testDb.db, me, { name: 'Sam' })
      await addTestPerson(testDb.db, me, { name: 'Zoe' })
      renderMembers()
      const dialog = await openEdit('Sam')

      await userEvent.clear(within(dialog).getByLabelText('Name'))
      await userEvent.type(within(dialog).getByLabelText('Name'), 'zoe')
      await save()

      expect(await screen.findByText('You already have someone called Zoe.')).toBeInTheDocument()
    })

    it('changes nothing on Cancel, and Save with nothing changed just closes', async () => {
      await addTestPerson(testDb.db, me, { name: 'Sam' })
      renderMembers()
      let dialog = await openEdit('Sam')
      await userEvent.type(within(dialog).getByLabelText('Name'), ' typed')
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit member' })).not.toBeInTheDocument())
      expect((await rowOf('Sam')).localName).toBeNull()

      dialog = await openEdit('Sam')
      expect(within(dialog).getByLabelText('Name')).toHaveValue('Sam')
      await save()
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit member' })).not.toBeInTheDocument())
      expect((await rowOf('Sam')).localName).toBeNull()
    })

    it('sets the email of a pending person, shared with their groups', async () => {
      await addTestPerson(testDb.db, me, { name: 'Sam' })
      renderMembers()
      const dialog = await openEdit('Sam')

      await userEvent.type(within(dialog).getByLabelText('Email'), 'Sam@Gmail.com')
      await save()

      expect(await screen.findByText('sam@gmail.com')).toBeInTheDocument()
      expect((await rowOf('Sam')).email).toBe('sam@gmail.com')
    })

    it('refuses an email someone else has, naming them, and keeps the dialog open', async () => {
      await addTestPerson(testDb.db, me, { name: 'Samuel Roy', email: 'sam@gmail.com' })
      await addTestPerson(testDb.db, me, { name: 'Sam' })
      renderMembers()
      const dialog = await openEdit('Sam')

      await userEvent.type(within(dialog).getByLabelText('Email'), 'sam@gmail.com')
      await save()

      expect(await screen.findByText('Samuel Roy is already in your list with this email.')).toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Edit member' })).toBeInTheDocument()
    })

    it('shows no email field for someone who has signed in and synced', async () => {
      const priya = await addTestPerson(testDb.db, me, { name: 'Priya', email: 'priya@gmail.com' })
      await testDb.db.insert(syncStatus).values({ scope: `member:some-group:${priya}`, lastSyncedAt: new Date() })
      renderMembers()

      const dialog = await openEdit('Priya')

      expect(within(dialog).getByLabelText('Name')).toBeInTheDocument()
      expect(within(dialog).queryByLabelText('Email')).not.toBeInTheDocument()
    })

    it('says so when the person is gone by the time Save is pressed', async () => {
      const sam = await addTestPerson(testDb.db, me, { name: 'Sam' })
      renderMembers()
      const dialog = await openEdit('Sam')
      await testDb.db.update(people).set({ deletedAt: new Date() }).where(eq(people.id, sam))

      await userEvent.clear(within(dialog).getByLabelText('Name'))
      await userEvent.type(within(dialog).getByLabelText('Name'), 'Sammy')
      await save()

      expect(await screen.findByText('This person is no longer available.')).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument())
    })

    it('says so when saving fails, and keeps what was typed', async () => {
      await addTestPerson(testDb.db, me, { name: 'Sam' })
      const failing = vi.spyOn(personService, 'updatePerson').mockRejectedValueOnce(new Error('boom'))
      renderMembers()
      const dialog = await openEdit('Sam')
      await userEvent.type(within(dialog).getByLabelText('Name'), ' Roy')

      await save()

      expect(await screen.findByText("Couldn't save the changes. Please try again.")).toBeInTheDocument()
      expect(within(dialog).getByLabelText('Name')).toHaveValue('Sam Roy')
      failing.mockRestore()
    })
  })
})

async function rowOf(name: string) {
  return (await testDb.db.select().from(people).where(eq(people.name, name)))[0]
}
