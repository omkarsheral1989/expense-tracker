// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { expensePhotos, expenseShares, expenses, groups, people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { expenseService } from '../../../services/expenseService'
import { photoService } from '../../../services/photoService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup, ensurePersonId, type TestGroupInput } from '../../../testing/groups.ts'
import { personIdForEmail } from '../../../testing/ids.ts'
import { renderPage } from '../../../testing/render.tsx'
import { SettleUpPage } from '../index.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const testDb = setUpTestDatabase()

async function createGroup(input: Partial<TestGroupInput> = {}) {
  const result = await createTestGroup(testDb.db, me, {
    name: 'Goa trip',
    type: 'trip',
    defaultCurrency: 'GBP',
    memberEmails: ['priya@gmail.com', 'sam@gmail.com'],
    ...input,
  })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
  return result.groupId
}

function renderSettleUp(groupId: string) {
  return renderPage(<SettleUpPage />, {
    path: ROUTES.settleUp(groupId),
    pattern: ROUTES.settleUpPattern,
    routes: [ROUTES.groupPattern, ROUTES.home],
  })
}

const payerSelect = () => screen.getByRole('combobox', { name: 'Who paid?' })
const recipientSelect = () => screen.getByRole('combobox', { name: 'Who received it?' })
const amountInput = () => screen.getByRole('textbox', { name: 'Amount' })
const notesInput = () => screen.getByRole('textbox', { name: 'Notes' })
const saveButton = () => screen.getByRole('button', { name: 'Save' })
const sentence = () => screen.queryByRole('heading', { level: 4 })?.textContent ?? null

/** The dropdown that is open now (a closed one stays in the page, hidden). */
function openDropdown() {
  return document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)') as HTMLElement
}

/** The names listed by the open dropdown, as seen on screen. */
function visibleOptions() {
  return [...openDropdown().querySelectorAll('.ant-select-item-option-content')].map((option) => option.textContent ?? '')
}

/** The form row of a field, to look for the message shown under it. */
function fieldOf(input: HTMLElement) {
  return input.closest('.ant-form-item') as HTMLElement
}

describe('SettleUpPage', () => {
  let user: ReturnType<typeof userEvent.setup>

  /** Opens a select and picks the entry with this name. */
  async function pick(select: HTMLElement, name: string) {
    await user.click(select)
    await waitFor(() => expect(openDropdown()).not.toBeNull())
    await user.click(within(openDropdown()).getByText(name, { selector: '.ant-select-item-option-content' }))
  }

  beforeEach(async () => {
    // Only the date is faked, so "today" is always 8 Oct 2026 and timers still run.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0))
    user = userEvent.setup()
    useAuthStore.setState({ profile: me, token: null })
    await ensurePersonId(testDb.db, me.email, me.name)
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.mocked(getDb).mockClear()
  })

  describe('when it opens', () => {
    it('has a quiet header title beside Back: a level 3 heading of 20 px and light weight, and an outlined Back button', async () => {
      const id = await createGroup()
      renderSettleUp(id)
      const title = await screen.findByRole('heading', { name: 'Settle up', level: 3 })
      expect(title).toHaveStyle({ fontSize: '20px', fontWeight: '300' })
      expect(title.parentElement).toContainElement(screen.getByRole('button', { name: 'Back' }))
      // Back is an outlined circle like the Delete button, not a bare icon.
      expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('ant-btn-variant-outlined')
    })

    it('asks who paid (you) and who received it (nobody yet), with an empty amount in the group\'s currency and today\'s date', async () => {
      const id = await createGroup({ defaultCurrency: 'EUR' })
      renderSettleUp(id)

      expect(await screen.findByRole('heading', { name: 'Settle up' })).toBeInTheDocument()
      expect(screen.getByText('Goa trip')).toBeInTheDocument()
      expect(within(fieldOf(payerSelect())).getByText('You')).toBeInTheDocument()
      expect(within(fieldOf(recipientSelect())).getByText('Choose a person')).toBeInTheDocument()
      expect(amountInput()).toHaveValue('')
      expect(screen.getByRole('button', { name: 'Currency: EUR' })).toHaveTextContent('€')
      expect(screen.getByRole('button', { name: 'Date: Today, 8 Oct 2026' })).toBeInTheDocument()
      expect(notesInput()).toHaveValue('')
      await waitFor(() => expect(document.title).toBe('Settle up · OwnLedger'))
    })

    it('shows no "who paid whom" sentence until a recipient is chosen', async () => {
      const id = await createGroup()
      renderSettleUp(id)
      await screen.findByRole('heading', { name: 'Settle up' })

      expect(sentence()).toBeNull()
      await pick(recipientSelect(), 'Priya Shah')
      expect(sentence()).toBe('You paid Priya')
    })

    it('lets the payer be any member, you first, and leaves the payer out of the recipients', async () => {
      const id = await createGroup()
      renderSettleUp(id)
      await screen.findByRole('heading', { name: 'Settle up' })

      await user.click(payerSelect())
      expect(visibleOptions()).toEqual(['You', 'Priya Shah', 'sam@gmail.com'])
      await user.keyboard('{Escape}')

      await user.click(recipientSelect())
      expect(visibleOptions()).toEqual(['Priya Shah', 'sam@gmail.com'])
    })

    it('shows grey placeholders while the group loads', async () => {
      const id = await createGroup()
      vi.mocked(getDb).mockImplementationOnce(() => new Promise(() => {}))
      renderSettleUp(id)

      expect(screen.getByRole('status', { name: 'Loading the group' })).toBeInTheDocument()
    })

    it('says "Group not found" for an unknown group, a group of other people and a deleted one', async () => {
      const others = await createTestGroup(testDb.db, { email: 'priya@gmail.com', name: 'Priya' }, {
        name: 'Flat', type: 'home', defaultCurrency: 'GBP', memberEmails: [],
      })
      if (!others.ok) throw new Error('refused')
      const deleted = await createGroup({ name: 'Old' })
      await testDb.db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, deleted))

      for (const id of [crypto.randomUUID(), others.groupId, deleted]) {
        const page = renderSettleUp(id)
        expect(await screen.findByText('Group not found')).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: 'Settle up' })).not.toBeInTheDocument()
        page.unmount()
      }
    })

    it('says it could not load, and loads again on "Try again"', async () => {
      const id = await createGroup()
      vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))
      renderSettleUp(id)

      expect(await screen.findByText("Couldn't load this group")).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Try again' }))

      expect(await screen.findByRole('heading', { name: 'Settle up' })).toBeInTheDocument()
    })

    it('lists the group\'s currency first among the recent ones in the currency picker', async () => {
      const id = await createGroup()
      await addTestExpense(testDb.db, me.email, id, { currency: 'INR' })
      renderSettleUp(id)
      await screen.findByRole('heading', { name: 'Settle up' })

      await user.click(screen.getByRole('button', { name: 'Currency: GBP' }))
      const dialog = await screen.findByRole('dialog', { name: 'Choose a currency' })

      const recent = within(within(dialog).getByRole('group', { name: 'Recent' })).getAllByRole('button')
      expect(recent.map((button) => button.textContent?.slice(0, 3))).toEqual(['INR'])
    })
  })

  describe('who paid whom', () => {
    it('words it for the payer and the recipient as they are chosen', async () => {
      const id = await createGroup()
      renderSettleUp(id)
      await screen.findByRole('heading', { name: 'Settle up' })

      await pick(recipientSelect(), 'Priya Shah')
      expect(sentence()).toBe('You paid Priya')

      await pick(payerSelect(), 'Priya Shah')
      // Priya cannot pay herself, so the recipient is cleared.
      expect(sentence()).toBeNull()
      expect(within(fieldOf(recipientSelect())).getByText('Choose a person')).toBeInTheDocument()

      await pick(recipientSelect(), 'You')
      expect(sentence()).toBe('Priya paid you')

      await pick(payerSelect(), 'sam@gmail.com')
      await pick(recipientSelect(), 'Priya Shah')
      expect(sentence()).toBe('Sam paid Priya')
    })

    it('keeps the recipient when another member becomes the payer', async () => {
      const id = await createGroup()
      renderSettleUp(id)
      await screen.findByRole('heading', { name: 'Settle up' })
      await pick(recipientSelect(), 'Priya Shah')

      await pick(payerSelect(), 'sam@gmail.com')

      expect(sentence()).toBe('Sam paid Priya')
    })
  })

  describe('saving', () => {
    it('saves a payment from you to the person chosen, says so, and goes back to the group', async () => {
      const id = await createGroup()
      const page = renderSettleUp(id)
      await screen.findByRole('heading', { name: 'Settle up' })
      await pick(recipientSelect(), 'Priya Shah')
      await user.type(amountInput(), '1234.5')
      await user.type(notesInput(), 'Cash at the airport')

      await user.click(saveButton())

      expect(await screen.findByText('Payment recorded.')).toBeInTheDocument()
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
      const [saved] = await testDb.db.select().from(expenses)
      expect(saved).toMatchObject({
        groupId: id,
        category: 'settlement',
        amountMinor: 123450,
        currency: 'GBP',
        date: '2026-10-08',
        notes: 'Cash at the airport',
        createdBy: personIdForEmail(me.email),
      })
      const shares = await testDb.db.select().from(expenseShares).where(eq(expenseShares.expenseId, saved.id))
      const priya = await personIdOf(testDb.db, 'priya@gmail.com')
      expect(shares.find((share) => share.personId === personIdForEmail(me.email))).toMatchObject({ paidMinor: 123450, owedMinor: 0 })
      expect(shares.find((share) => share.personId === priya)).toMatchObject({ paidMinor: 0, owedMinor: 123450 })
    })

    it('updates what is owed: it settles a debt', async () => {
      const id = await createGroup({ memberEmails: ['priya@gmail.com'] })
      await addTestExpense(testDb.db, 'priya@gmail.com', id, { amountMinor: 2000 })
      renderSettleUp(id)
      await screen.findByRole('heading', { name: 'Settle up' })
      await pick(recipientSelect(), 'Priya Shah')
      await user.type(amountInput(), '10')

      await user.click(saveButton())

      await screen.findByText('Payment recorded.')
      expect(await expenseService.groupBalances(testDb.db, personIdForEmail(me.email), id)).toEqual([])
    })

    it('saves a payment between two other members, with the chosen date and currency', async () => {
      const id = await createGroup()
      renderSettleUp(id)
      await screen.findByRole('heading', { name: 'Settle up' })
      await pick(payerSelect(), 'Priya Shah')
      await pick(recipientSelect(), 'sam@gmail.com')
      await user.type(amountInput(), '5')
      await user.click(screen.getByRole('button', { name: 'Currency: GBP' }))
      await user.type(await screen.findByRole('textbox', { name: /search/i }), 'euro')
      await user.click(await screen.findByRole('button', { name: /EUR/ }))

      await user.click(saveButton())

      await screen.findByText('Payment recorded.')
      const [saved] = await testDb.db.select().from(expenses)
      expect(saved).toMatchObject({ amountMinor: 500, currency: 'EUR' })
      const shares = await testDb.db.select().from(expenseShares).where(eq(expenseShares.expenseId, saved.id))
      const byPerson = new Map(shares.map((share) => [share.personId, [share.paidMinor, share.owedMinor]]))
      expect(byPerson.get(await personIdOf(testDb.db, 'priya@gmail.com'))).toEqual([500, 0])
      expect(byPerson.get(await personIdOf(testDb.db, 'sam@gmail.com'))).toEqual([0, 500])
      expect(byPerson.get(personIdForEmail(me.email))).toEqual([0, 0])
    })

    it('shows every problem at once, each beside its own field, and saves nothing', async () => {
      const id = await createGroup()
      const page = renderSettleUp(id)
      await screen.findByRole('heading', { name: 'Settle up' })

      await user.click(saveButton())

      expect(await within(fieldOf(recipientSelect())).findByText('Choose who received it.')).toBeInTheDocument()
      expect(within(fieldOf(amountInput())).getByText('Enter an amount.')).toBeInTheDocument()
      expect(page.currentPath()).toBe(ROUTES.settleUp(id))
      expect(await testDb.db.select().from(expenses)).toEqual([])
    })

    it('clears a message as soon as its field is edited', async () => {
      const id = await createGroup()
      renderSettleUp(id)
      await screen.findByRole('heading', { name: 'Settle up' })
      await user.click(saveButton())
      await screen.findByText('Choose who received it.')

      await pick(recipientSelect(), 'Priya Shah')
      await waitFor(() => expect(screen.queryByText('Choose who received it.')).not.toBeInTheDocument())
      expect(screen.getByText('Enter an amount.')).toBeInTheDocument()

      await user.type(amountInput(), '1')
      await waitFor(() => expect(screen.queryByText('Enter an amount.')).not.toBeInTheDocument())
    })

    it('says so and stays on the form when saving fails, and saves on a second try', async () => {
      const id = await createGroup()
      const page = renderSettleUp(id)
      await screen.findByRole('heading', { name: 'Settle up' })
      await pick(recipientSelect(), 'Priya Shah')
      await user.type(amountInput(), '5')
      vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))

      await user.click(saveButton())

      expect(await screen.findByText("Couldn't record the payment. Please try again.")).toBeInTheDocument()
      expect(page.currentPath()).toBe(ROUTES.settleUp(id))
      expect(amountInput()).toHaveValue('5')
      expect(await testDb.db.select().from(expenses)).toEqual([])

      await user.click(saveButton())
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
      expect(await testDb.db.select().from(expenses)).toHaveLength(1)
    })

    describe('receipt photos', () => {
      const photo = (name: string, type = 'image/jpeg') => new File([`picture ${name}`], name, { type })
      const chooser = () => screen.getByTestId('receipt-chooser') as HTMLInputElement

      it('keeps the photos on the device with the payment when it is saved', async () => {
        const id = await createGroup()
        renderSettleUp(id)
        await screen.findByRole('heading', { name: 'Settle up' })
        await pick(recipientSelect(), 'Priya Shah')
        await user.type(amountInput(), '5')
        await user.upload(chooser(), [photo('a.jpg'), photo('b.png', 'image/png')])

        await user.click(saveButton())
        await screen.findByText('Payment recorded.')

        const photos = await testDb.db.select().from(expensePhotos).orderBy(expensePhotos.position)
        expect(photos.map((row) => row.mimeType)).toEqual(['image/jpeg', 'image/png'])
        expect(await (await photoService.open(me.id).getPhoto(photos[1].id))?.text()).toBe('picture b.png')
      })

      it('takes the photos off the device again when the payment is not saved', async () => {
        const id = await createGroup()
        renderSettleUp(id)
        await screen.findByRole('heading', { name: 'Settle up' })
        await user.upload(chooser(), photo('a.jpg'))
        const removeReceipts = vi.spyOn(photoService, 'removeReceipts')

        // No recipient and no amount: the payment is refused.
        await user.click(saveButton())

        await screen.findByText('Enter an amount.')
        await waitFor(() => expect(removeReceipts).toHaveBeenCalledTimes(1))
        const [, ids] = removeReceipts.mock.calls[0]
        expect(await photoService.open(me.id).getPhoto(ids[0])).toBeNull()
        expect(await testDb.db.select().from(expensePhotos)).toEqual([])
      })

      it('takes the photos off the device again when saving fails', async () => {
        const id = await createGroup()
        renderSettleUp(id)
        await screen.findByRole('heading', { name: 'Settle up' })
        await pick(recipientSelect(), 'Priya Shah')
        await user.type(amountInput(), '5')
        await user.upload(chooser(), photo('a.jpg'))
        const removeReceipts = vi.spyOn(photoService, 'removeReceipts')
        vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))

        await user.click(saveButton())

        expect(await screen.findByText("Couldn't record the payment. Please try again.")).toBeInTheDocument()
        await waitFor(() => expect(removeReceipts).toHaveBeenCalledTimes(1))
        const [, ids] = removeReceipts.mock.calls[0]
        expect(await photoService.open(me.id).getPhoto(ids[0])).toBeNull()
      })
    })
  })

  describe('leaving', () => {
    it('goes straight back to the group on Back while nothing is entered', async () => {
      const id = await createGroup()
      const page = renderSettleUp(id)
      await screen.findByRole('heading', { name: 'Settle up' })

      await user.click(screen.getByRole('button', { name: 'Back' }))

      expect(page.currentPath()).toBe(ROUTES.group(id))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it.each([
      ['a recipient is chosen', async () => pick(recipientSelect(), 'Priya Shah')],
      ['an amount is typed', async () => user.type(amountInput(), '5')],
      ['a note is written', async () => user.type(notesInput(), 'cash')],
      ['the payer is changed', async () => pick(payerSelect(), 'Priya Shah')],
      ['a photo is added', async () => user.upload(screen.getByTestId('receipt-chooser'), new File(['x'], 'a.jpg', { type: 'image/jpeg' }))],
    ])('asks "Discard this payment?" once %s', async (_what, change) => {
      const id = await createGroup()
      const page = renderSettleUp(id)
      await screen.findByRole('heading', { name: 'Settle up' })
      await change()

      await user.click(screen.getByRole('button', { name: 'Back' }))

      const dialog = await screen.findByRole('dialog', { name: 'Discard this payment?' })
      expect(within(dialog).getByText('What you entered will be lost.')).toBeInTheDocument()
      expect(page.currentPath()).toBe(ROUTES.settleUp(id))
    })

    it('keeps the input on "Keep editing", and leaves without saving on "Discard"', async () => {
      const id = await createGroup()
      const page = renderSettleUp(id)
      await screen.findByRole('heading', { name: 'Settle up' })
      await user.type(amountInput(), '5')

      await user.click(screen.getByRole('button', { name: 'Back' }))
      await user.click(await screen.findByRole('button', { name: 'Keep editing' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard this payment?' })).not.toBeInTheDocument())
      expect(page.currentPath()).toBe(ROUTES.settleUp(id))
      expect(amountInput()).toHaveValue('5')

      await user.click(screen.getByRole('button', { name: 'Back' }))
      await user.click(await screen.findByRole('button', { name: 'Discard' }))
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
      expect(await testDb.db.select().from(expenses)).toEqual([])
    })

    it('warns before the tab is reloaded or closed, only while there is input', async () => {
      const id = await createGroup()
      renderSettleUp(id)
      await screen.findByRole('heading', { name: 'Settle up' })
      const tryToLeave = () => {
        const event = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(event)
        return event.defaultPrevented
      }

      expect(tryToLeave()).toBe(false)
      await user.type(amountInput(), '5')
      expect(tryToLeave()).toBe(true)
    })
  })

  it('shows nothing when nobody is signed in', () => {
    useAuthStore.setState({ profile: null, guest: false, token: null })
    renderSettleUp(crypto.randomUUID())

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
