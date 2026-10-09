// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { expensePhotos, expenseShares, expenses, people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { photoService } from '../../../services/photoService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpAddExpenseTests, me, named, descriptionInput, amountInput, notesInput, saveButton, fieldOf } from './helpers.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const { testDb, createGroup, renderForm } = setUpAddExpenseTests()

describe('AddExpensePage', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    // Only the date is faked, so "today" is always 8 Oct 2026 and timers still run.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0))
    user = userEvent.setup()
    useAuthStore.setState({ profile: me, token: null })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.mocked(getDb).mockClear()
  })

  describe('receipt photos', () => {
    const photo = (name: string, type = 'image/jpeg') => new File([`picture ${name}`], name, { type })
    const chooser = () => screen.getByTestId('receipt-chooser') as HTMLInputElement
    const previews = () => screen.queryAllByRole('img', { name: /^Receipt photo/ }).map((img) => img.getAttribute('alt'))

    it('opens the device\'s file chooser for pictures, several at a time', async () => {
      const id = await createGroup()
      renderForm(id)
      await screen.findByRole('heading', { name: 'Add expense' })

      const click = vi.spyOn(chooser(), 'click')
      await user.click(screen.getByRole('button', { name: named('Add receipt photos') }))

      expect(click).toHaveBeenCalled()
      expect(chooser()).toHaveAttribute('accept', 'image/*')
      expect(chooser()).toHaveAttribute('multiple')
    })

    it('shows the chosen photos in order, each with an x that takes it out', async () => {
      const id = await createGroup()
      renderForm(id)
      await screen.findByRole('heading', { name: 'Add expense' })

      await user.upload(chooser(), [photo('a.jpg'), photo('b.png', 'image/png')])
      await user.upload(chooser(), photo('c.jpg'))
      expect(previews()).toEqual(['Receipt photo 1', 'Receipt photo 2', 'Receipt photo 3'])
      expect(screen.getByRole('img', { name: 'Receipt photo 1' })).toHaveAttribute('src', expect.stringMatching(/^blob:/))

      await user.click(screen.getByRole('button', { name: named('Remove receipt photo 1') }))
      expect(previews()).toEqual(['Receipt photo 1', 'Receipt photo 2'])
    })

    it('ignores files that are not pictures', async () => {
      const id = await createGroup()
      renderForm(id)
      await screen.findByRole('heading', { name: 'Add expense' })
      // As a browser might when its chooser lets any file through.
      const anyFile = userEvent.setup({ applyAccept: false })

      await anyFile.upload(chooser(), [photo('bill.pdf', 'application/pdf'), photo('a.jpg')])

      expect(previews()).toEqual(['Receipt photo 1'])
    })

    it('takes up to 10 photos, then says so and switches the button off', async () => {
      const id = await createGroup()
      renderForm(id)
      await screen.findByRole('heading', { name: 'Add expense' })

      await user.upload(chooser(), Array.from({ length: 11 }, (_, index) => photo(`${index}.jpg`)))

      expect(previews()).toHaveLength(10)
      expect(await screen.findByText('An expense can have up to 10 photos.')).toBeInTheDocument()
      const button = screen.getByRole('button', { name: named('Add receipt photos') })
      expect(button).toBeDisabled()
      await user.hover(button.parentElement as HTMLElement)
      expect(await screen.findByText('Up to 10 photos.')).toBeInTheDocument()
    })

    it('keeps the photos on the device with the expense when it is saved', async () => {
      const id = await createGroup()
      renderForm(id)
      await user.type(await screen.findByRole('textbox', { name: 'Description' }), 'Dinner')
      await user.type(amountInput(), '12')
      await user.upload(chooser(), [photo('a.jpg'), photo('b.png', 'image/png')])

      await user.click(saveButton())
      await screen.findByText('Expense added.')

      const photos = await testDb.db.select().from(expensePhotos).orderBy(expensePhotos.position)
      expect(photos.map((row) => [row.mimeType, row.sizeBytes])).toEqual([
        ['image/jpeg', 13],
        ['image/png', 13],
      ])
      const store = photoService.open(me.id)
      expect(await (await store.getPhoto(photos[1].id))?.text()).toBe('picture b.png')
      expect(await store.getThumbnail(photos[0].id)).not.toBeNull()
    })

    it('takes the photos off the device again when the expense is not saved', async () => {
      const id = await createGroup()
      renderForm(id)
      await user.type(await screen.findByRole('textbox', { name: 'Description' }), 'Dinner')
      await user.upload(chooser(), photo('a.jpg'))
      const removeReceipts = vi.spyOn(photoService, 'removeReceipts')

      // No amount: the expense is refused.
      await user.click(saveButton())

      await screen.findByText('Enter an amount.')
      await waitFor(() => expect(removeReceipts).toHaveBeenCalledTimes(1))
      const [, ids] = removeReceipts.mock.calls[0]
      expect(ids).toHaveLength(1)
      expect(await photoService.open(me.id).getPhoto(ids[0])).toBeNull()
      expect(await testDb.db.select().from(expensePhotos)).toEqual([])
    })

    it('takes the photos off the device again when saving fails', async () => {
      const id = await createGroup()
      renderForm(id)
      await user.type(await screen.findByRole('textbox', { name: 'Description' }), 'Dinner')
      await user.type(amountInput(), '12')
      await user.upload(chooser(), photo('a.jpg'))
      const removeReceipts = vi.spyOn(photoService, 'removeReceipts')
      vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))

      await user.click(saveButton())

      expect(await screen.findByText("Couldn't add the expense. Please try again.")).toBeInTheDocument()
      await waitFor(() => expect(removeReceipts).toHaveBeenCalledTimes(1))
      const [, ids] = removeReceipts.mock.calls[0]
      expect(await photoService.open(me.id).getPhoto(ids[0])).toBeNull()
      // The chosen photos stay on the form, to try again.
      expect(previews()).toEqual(['Receipt photo 1'])
    })

    it('counts chosen photos as input when leaving', async () => {
      const id = await createGroup()
      renderForm(id)
      await screen.findByRole('heading', { name: 'Add expense' })
      await user.upload(chooser(), photo('a.jpg'))

      await user.click(screen.getByRole('button', { name: 'Back' }))

      expect(await screen.findByRole('dialog', { name: 'Discard this expense?' })).toBeInTheDocument()
    })
  })

  describe('pressing Save', () => {
    it('shows every problem at once, each beside its own field', async () => {
      const id = await createGroup()
      renderForm(id)
      await screen.findByRole('heading', { name: 'Add expense' })

      await user.click(saveButton())

      expect(await within(fieldOf(descriptionInput())).findByText('Enter a description.')).toBeInTheDocument()
      expect(within(fieldOf(amountInput())).getByText('Enter an amount.')).toBeInTheDocument()
      expect(await testDb.db.select().from(expenses)).toEqual([])
    })

    it('makes a message disappear as soon as its field is edited', async () => {
      const id = await createGroup()
      renderForm(id)
      await screen.findByRole('heading', { name: 'Add expense' })
      await user.click(saveButton())
      await screen.findByText('Enter a description.')

      await user.type(descriptionInput(), 'D')

      await waitFor(() => expect(screen.queryByText('Enter a description.')).not.toBeInTheDocument())
      expect(screen.getByText('Enter an amount.')).toBeInTheDocument()
    })

    it.each([
      ['0', 'Enter an amount more than 0.'],
      ['0.00', 'Enter an amount more than 0.'],
      ['1000000000.01', 'Enter at most 1,000,000,000.'],
    ])('refuses the amount %j', async (typed, message) => {
      const id = await createGroup()
      renderForm(id)
      await user.type(await screen.findByRole('textbox', { name: 'Description' }), 'Dinner')
      await user.type(amountInput(), typed)

      await user.click(saveButton())

      expect(await within(fieldOf(amountInput())).findByText(message)).toBeInTheDocument()
      expect(await testDb.db.select().from(expenses)).toEqual([])
    })

    it('refuses a description over 100 characters', async () => {
      const id = await createGroup()
      renderForm(id)
      await user.click(await screen.findByRole('textbox', { name: 'Description' }))
      await user.paste('a'.repeat(101))
      await user.type(amountInput(), '5')

      await user.click(saveButton())

      expect(await screen.findByText('Use at most 100 characters.')).toBeInTheDocument()
    })
  })

  describe('saving', () => {
    it('saves the expense, split equally with you paying, and opens the group with a message', async () => {
      const id = await createGroup({ defaultCurrency: 'INR', memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
      const page = renderForm(id)
      await user.type(await screen.findByRole('textbox', { name: 'Description' }), '  Beach shack dinner ')
      await user.type(amountInput(), '1000')
      await user.click(screen.getByRole('button', { name: /^Category: / }))
      await user.click(within(await screen.findByRole('dialog', { name: 'Choose a category' })).getByRole('button', { name: 'Dining out' }))
      await user.click(screen.getByRole('button', { name: /^Date: / }))
      await user.click((await screen.findByRole('dialog', { name: 'Choose a date' })).querySelector('td[title="2026-10-05"]') as HTMLElement)
      await user.type(notesInput(), 'Paid by card')

      await user.click(saveButton())

      expect(await screen.findByText('Expense added.')).toBeInTheDocument()
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))

      const [saved] = await testDb.db.select().from(expenses)
      expect(saved).toMatchObject({
        groupId: id,
        description: 'Beach shack dinner',
        category: 'food.dining_out',
        amountMinor: 100000,
        currency: 'INR',
        date: '2026-10-05',
        notes: 'Paid by card',
        method: 'equal',
      })
      const shares = await testDb.db
        .select({ email: people.email, paid: expenseShares.paidMinor, owed: expenseShares.owedMinor })
        .from(expenseShares)
        .innerJoin(people, eq(people.id, expenseShares.personId))
        .orderBy(people.email)
      expect(shares).toEqual([
        { email: 'omkar@gmail.com', paid: 100000, owed: 33334 },
        { email: 'priya@gmail.com', paid: 0, owed: 33333 },
        { email: 'sam@gmail.com', paid: 0, owed: 33333 },
      ])
    })

    it('saves the amount in the currency picked, not the group\'s', async () => {
      const id = await createGroup({ defaultCurrency: 'GBP' })
      renderForm(id)
      await user.type(await screen.findByRole('textbox', { name: 'Description' }), 'Sushi')
      await user.type(amountInput(), '1500')
      await user.click(screen.getByRole('button', { name: /^Currency: / }))
      const dialog = await screen.findByRole('dialog', { name: 'Choose a currency' })
      await user.type(within(dialog).getByRole('textbox', { name: 'Search currencies' }), 'JPY')
      await user.click(within(dialog).getByRole('button', { name: /^JPY/ }))

      await user.click(saveButton())

      await screen.findByText('Expense added.')
      const [saved] = await testDb.db.select().from(expenses)
      expect(saved).toMatchObject({ amountMinor: 1500, currency: 'JPY' })
    })

    it('says so and stays on the form when saving fails, and can be tried again', async () => {
      const id = await createGroup()
      const page = renderForm(id)
      await user.type(await screen.findByRole('textbox', { name: 'Description' }), 'Dinner')
      await user.type(amountInput(), '12')
      vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))

      await user.click(saveButton())

      expect(await screen.findByText("Couldn't add the expense. Please try again.")).toBeInTheDocument()
      expect(page.currentPath()).toBe(ROUTES.newExpense(id))
      expect(descriptionInput()).toHaveValue('Dinner')

      await user.click(saveButton())
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
      expect(await testDb.db.select().from(expenses)).toHaveLength(1)
    })
  })

  describe('leaving', () => {
    it('goes back to the group at once from an untouched form', async () => {
      const id = await createGroup()
      const page = renderForm(id)

      await user.click(await screen.findByRole('button', { name: 'Back' }))

      expect(page.currentPath()).toBe(ROUTES.group(id))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does not count spaces as input', async () => {
      const id = await createGroup()
      const page = renderForm(id)
      await user.type(await screen.findByRole('textbox', { name: 'Description' }), '   ')

      await user.click(screen.getByRole('button', { name: 'Back' }))

      expect(page.currentPath()).toBe(ROUTES.group(id))
    })

    it.each([
      ['a description is typed', async () => user.type(descriptionInput(), 'Dinner')],
      ['an amount is typed', async () => user.type(amountInput(), '5')],
      ['notes are typed', async () => user.type(notesInput(), 'Card')],
      [
        'the category is changed',
        async () => {
          await user.click(screen.getByRole('button', { name: /^Category: / }))
          await user.click(within(await screen.findByRole('dialog', { name: 'Choose a category' })).getByRole('button', { name: 'Taxi' }))
        },
      ],
    ])('asks "Discard this expense?" once %s', async (_, change) => {
      const id = await createGroup()
      const page = renderForm(id)
      await screen.findByRole('heading', { name: 'Add expense' })
      await change()

      await user.click(screen.getByRole('button', { name: 'Back' }))

      const dialog = await screen.findByRole('dialog', { name: 'Discard this expense?' })
      expect(within(dialog).getByText('What you entered will be lost.')).toBeInTheDocument()
      expect(page.currentPath()).toBe(ROUTES.newExpense(id))
    })

    it('keeps the input on "Keep editing", and leaves without saving on "Discard"', async () => {
      const id = await createGroup()
      const page = renderForm(id)
      await user.type(await screen.findByRole('textbox', { name: 'Description' }), 'Dinner')
      await user.type(amountInput(), '5')

      await user.click(screen.getByRole('button', { name: 'Back' }))
      await user.click(await screen.findByRole('button', { name: 'Keep editing' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard this expense?' })).not.toBeInTheDocument())
      expect(page.currentPath()).toBe(ROUTES.newExpense(id))
      expect(descriptionInput()).toHaveValue('Dinner')

      await user.click(screen.getByRole('button', { name: 'Back' }))
      await user.click(await screen.findByRole('button', { name: 'Discard' }))
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
      expect(await testDb.db.select().from(expenses)).toEqual([])
    })

    it('warns before the tab is reloaded or closed, only while there is input', async () => {
      const id = await createGroup()
      renderForm(id)
      const tryToLeave = () => {
        const event = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(event)
        return event.defaultPrevented
      }

      await screen.findByRole('heading', { name: 'Add expense' })
      expect(tryToLeave()).toBe(false)
      await user.type(amountInput(), '5')
      expect(tryToLeave()).toBe(true)
    })
  })
})
