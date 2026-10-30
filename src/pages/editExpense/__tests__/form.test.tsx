// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { expenseEvents, expenseShares, expenses, people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { personIdOf } from '../../../testing/expenses.ts'
import { amountInput, descriptionInput, me, named, notesInput, saveButton, sentence, setUpEditExpenseTests } from './helpers.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const { testDb, createGroup, addExpense, renderEdit } = setUpEditExpenseTests()

/** The edit events of the expenses saved so far, oldest first. */
async function editEvents() {
  const rows = await testDb.db.select().from(expenseEvents).where(eq(expenseEvents.kind, 'edited'))
  return rows.toSorted((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
}

describe('EditExpensePage', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    // Only the date is faked, so "today" is always 20 Oct 2026 and timers still run.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 20, 12, 0))
    user = userEvent.setup()
    useAuthStore.setState({ profile: me, token: null })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.mocked(getDb).mockClear()
  })

  async function open(groupId: string, expenseId: string) {
    const page = renderEdit(groupId, expenseId)
    await screen.findByRole('heading', { name: 'Edit expense' })
    return page
  }

  async function chooseCategory(label: string) {
    await user.click(screen.getByRole('button', { name: /^Category: / }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Choose a category' })).getByRole('button', { name: label }))
  }

  /** The saved expense row, and each person's [paid, owed, entered]. */
  async function saved(expenseId: string) {
    const [expense] = await testDb.db.select().from(expenses).where(eq(expenses.id, expenseId))
    const shares = await testDb.db
      .select({ email: people.email, paid: expenseShares.paidMinor, owed: expenseShares.owedMinor, input: expenseShares.inputValue })
      .from(expenseShares)
      .innerJoin(people, eq(people.id, expenseShares.personId))
      .where(eq(expenseShares.expenseId, expenseId))
      .orderBy(people.email)
    return {
      expense,
      shares: Object.fromEntries(shares.map((share) => [(share.email ?? '').split('@')[0], [share.paid, share.owed, share.input]])),
    }
  }

  describe('opening', () => {
    it('has a quiet header title beside Back: a level 3 heading of 32 px, thin and in capitals, and an outlined Back button', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      renderEdit(id, expenseId)
      const title = await screen.findByRole('heading', { name: 'Edit expense', level: 3 })
      expect(title).toHaveStyle({ fontSize: '32px', fontWeight: '100', lineHeight: '40px', textTransform: 'uppercase' })
      expect(title.parentElement).toContainElement(screen.getByRole('button', { name: 'Back' }))
      // Back is an outlined circle like the Delete button, not a bare icon.
      expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('ant-btn-variant-outlined')
    })

    it('is the expense form, titled "Edit expense", opened with what was saved', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await open(id, expenseId)

      await waitFor(() => expect(document.title).toBe('Edit expense · OwnLedger'))
      expect(descriptionInput()).toHaveValue('Beach shack dinner')
      expect(amountInput()).toHaveValue('9.00')
      expect(notesInput()).toHaveValue('Card')
      expect(screen.getByRole('button', { name: 'Category: Dining out' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Currency: GBP' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: named('Mon, 5 Oct 2026') })).toBeInTheDocument()
      expect(sentence()).toBe('Paid by you and split equally')
    })

    it('opens with the payer and the split as they were entered', async () => {
      const id = await createGroup()
      const priyaId = (await testDb.db.select().from(people).where(eq(people.email, 'priya@gmail.com')))[0].id
      const meId = (await testDb.db.select().from(people).where(eq(people.email, me.email)))[0].id
      const samId = (await testDb.db.select().from(people).where(eq(people.email, 'sam@gmail.com')))[0].id
      const expenseId = await addExpense(id, {
        paidBy: priyaId,
        split: { method: 'percent', values: { [meId]: 50, [priyaId]: 30, [samId]: 20 } },
      })
      await open(id, expenseId)

      expect(sentence()).toBe('Paid by Priya and split unequally')
      await user.click(screen.getByRole('button', { name: 'unequally' }))
      const dialog = await screen.findByRole('dialog', { name: 'Split options' })
      expect(within(dialog).getByRole('tab', { name: /Percent/, selected: true })).toBeInTheDocument()
      expect(within(dialog).getByRole('textbox', { name: 'Percentage for you' })).toHaveValue('50')
      expect(within(dialog).getByRole('textbox', { name: 'Percentage for Priya Shah' })).toHaveValue('30')
      expect(within(dialog).getByRole('textbox', { name: 'Percentage for sam@gmail.com' })).toHaveValue('20')
    })

    it('shows the group in the same full-width dropdown as add expense, switched off, even when the user has other groups', async () => {
      const id = await createGroup()
      await createGroup({ name: 'Flat bills' })
      const expenseId = await addExpense(id)
      await open(id, expenseId)

      const group = screen.getByRole('button', { name: 'Group: Goa trip' })
      expect(group).toBeDisabled()
      expect(group).toHaveClass('ant-btn-block')
      expect(group.querySelector('.tabler-icon-chevron-down')).not.toBeNull()
      // The same content as a row of the group menu: the type's tile, the name and "currency · members".
      expect(group.querySelector('[role="img"][aria-label="Trip"]')).toHaveStyle({ width: '40px', height: '40px' })
      expect(group).toHaveTextContent(/Goa trip.* · 3 members/)
      // An expense cannot move to another group, so there is no menu.
      expect(screen.queryByRole('button', { name: /Choose another group/ })).not.toBeInTheDocument()
    })
  })

  describe('Cancel and Save under the receipts', () => {
    it('has only Back in the header, and ends the form with Cancel and Save, after the receipts', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await open(id, expenseId)

      const header = screen.getByRole('heading', { name: 'Edit expense', level: 3 }).closest('[data-vt="header"]') as HTMLElement
      expect(within(header).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Back'])
      const save = saveButton()
      expect(save).toHaveTextContent('Save')
      expect(save).toHaveAttribute('type', 'submit')
      const row = save.parentElement as HTMLElement
      expect(within(row).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(row).toHaveClass('ant-flex-justify-flex-end')
      const camera = screen.getByRole('button', { name: 'Add receipt photos' })
      expect(camera.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('goes straight back on Cancel while nothing was changed, and asks "Discard your changes?" after a change', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const page = await open(id, expenseId)
      await user.type(descriptionInput(), '!')

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      const dialog = await screen.findByRole('dialog', { name: 'Discard your changes?' })
      expect(page.currentPath()).toBe(ROUTES.editExpense(id, expenseId))
      await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard your changes?' })).not.toBeInTheDocument())
    })
  })

  describe('saving', () => {
    it('saves every field, says "Expense updated." and returns to the details page', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const page = await open(id, expenseId)

      await user.clear(descriptionInput())
      await user.type(descriptionInput(), 'Lunch')
      await user.clear(amountInput())
      await user.type(amountInput(), '24.50')
      await user.clear(notesInput())
      await user.type(notesInput(), 'Cash')
      await chooseCategory('Groceries')
      await user.click(saveButton())

      expect(await screen.findByText('Expense updated.')).toBeInTheDocument()
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.expense(id, expenseId)))
      const { expense, shares } = await saved(expenseId)
      expect(expense).toMatchObject({
        description: 'Lunch',
        amountMinor: 2450,
        notes: 'Cash',
        category: 'food.groceries',
      })
      // The amount changed, so everyone's part is worked out again: 24.50 over three leaves 2 pence with the payer.
      expect(shares).toEqual({ omkar: [2450, 818, 1], priya: [0, 816, 1], sam: [0, 816, 1] })
    })

    it('records one edit event with who, when, what changed and the expense as it is after', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await open(id, expenseId)

      await user.clear(descriptionInput())
      await user.type(descriptionInput(), 'Lunch')
      await user.click(saveButton())
      await screen.findByText('Expense updated.')

      const events = await editEvents()
      expect(events).toHaveLength(1)
      expect(events[0].snapshot).toMatchObject({ description: 'Lunch', amountMinor: 900, notes: 'Card' })
      expect(events[0].changes).toEqual([{ field: 'description', from: 'Beach shack dinner', to: 'Lunch' }])
      expect(events[0].occurredAt).toEqual(new Date(2026, 9, 20, 12, 0))
      expect(events[0].actedBy).toBe(await personIdOf(testDb.db, me.email))
    })

    it('changes who paid and how it is split', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await open(id, expenseId)

      await user.click(screen.getByRole('button', { name: 'you' }))
      const payers = await screen.findByRole('dialog', { name: 'Who paid?' })
      await user.click(within(payers).getByRole('button', { name: /Priya Shah/ }))
      await waitFor(() => expect(sentence()).toBe('Paid by Priya and split equally'))
      await user.click(saveButton())

      await screen.findByText('Expense updated.')
      expect((await saved(expenseId)).shares).toEqual({ omkar: [0, 300, 1], priya: [900, 300, 1], sam: [0, 300, 1] })
      const [revision] = await editEvents()
      expect(revision.changes.map((change) => change.field)).toEqual(['paidBy'])
    })

    it('says nothing and writes nothing when nothing was changed, spaces apart', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const page = await open(id, expenseId)
      const [before] = await testDb.db.select().from(expenses).where(eq(expenses.id, expenseId))
      await user.type(descriptionInput(), '  ')

      await user.click(saveButton())

      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.expense(id, expenseId)))
      expect(screen.queryByText('Expense updated.')).not.toBeInTheDocument()
      expect(await editEvents()).toEqual([])
      const [after] = await testDb.db.select().from(expenses).where(eq(expenses.id, expenseId))
      expect(after.updatedAt).toEqual(before.updatedAt)
    })

    it('edits the same expense again and again, each edit keeping its own event', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)

      for (const description of ['Lunch', 'Brunch', 'Tea']) {
        const page = await open(id, expenseId)
        expect(descriptionInput()).not.toHaveValue(description)
        await user.clear(descriptionInput())
        await user.type(descriptionInput(), description)
        await user.click(saveButton())
        await waitFor(() => expect(page.currentPath()).toBe(ROUTES.expense(id, expenseId)))
        cleanup()
      }

      const events = await editEvents()
      expect(events.map((event) => event.snapshot.description).toSorted()).toEqual(['Brunch', 'Lunch', 'Tea'])
      await open(id, expenseId)
      expect(descriptionInput()).toHaveValue('Tea')
    })

    it('shows every problem beside its field, keeps what was typed and saves nothing', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await open(id, expenseId)

      await user.clear(descriptionInput())
      await user.clear(amountInput())
      await user.click(saveButton())

      const field = (input: HTMLElement) => input.closest('.ant-form-item') as HTMLElement
      expect(await within(field(descriptionInput())).findByText('Enter a description.')).toBeInTheDocument()
      expect(within(field(amountInput())).getByText('Enter an amount.')).toBeInTheDocument()
      expect(notesInput()).toHaveValue('Card')
      expect(await editEvents()).toEqual([])
      expect((await saved(expenseId)).expense.description).toBe('Beach shack dinner')

      // A message goes as soon as its field is edited.
      await user.type(descriptionInput(), 'Lunch')
      expect(within(field(descriptionInput())).queryByText('Enter a description.')).not.toBeInTheDocument()
    })

    it('says the split no longer adds up when the amount changed under exact amounts', async () => {
      const id = await createGroup()
      const meId = (await testDb.db.select().from(people).where(eq(people.email, me.email)))[0].id
      const priyaId = (await testDb.db.select().from(people).where(eq(people.email, 'priya@gmail.com')))[0].id
      const expenseId = await addExpense(id, {
        split: { method: 'exact', values: { [meId]: 400, [priyaId]: 500 } },
      })
      await open(id, expenseId)

      await user.clear(amountInput())
      await user.type(amountInput(), '12')

      expect(await screen.findByText('The split no longer adds up.')).toBeInTheDocument()
      await user.click(saveButton())
      await waitFor(() => expect(screen.getAllByText('The split no longer adds up.').length).toBeGreaterThan(0))
      expect(await editEvents()).toEqual([])
    })

    it('says so and keeps what was typed when saving fails', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const page = await open(id, expenseId)
      await user.type(notesInput(), ' and tip')
      vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))

      await user.click(saveButton())

      expect(await screen.findByText("Couldn't save the changes. Please try again.")).toBeInTheDocument()
      expect(page.currentPath()).toBe(ROUTES.editExpense(id, expenseId))
      expect(notesInput()).toHaveValue('Card and tip')
    })

    it('says the expense is no longer available and goes to the group when it was deleted meanwhile', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const page = await open(id, expenseId)
      await user.type(notesInput(), ' and tip')
      await testDb.db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, expenseId))

      await user.click(saveButton())

      expect(await screen.findByText('This expense is no longer available.')).toBeInTheDocument()
      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
    })
  })

  describe('leaving', () => {
    it('goes straight back to the details page while nothing was changed', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const page = await open(id, expenseId)

      await user.click(screen.getByRole('button', { name: 'Back' }))

      expect(page.currentPath()).toBe(ROUTES.expense(id, expenseId))
    })

    it('does not count spaces, or an amount typed the same way, as a change', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const page = await open(id, expenseId)

      await user.type(descriptionInput(), '  ')
      await user.clear(amountInput())
      await user.type(amountInput(), '9')
      await user.click(screen.getByRole('button', { name: 'Back' }))

      expect(page.currentPath()).toBe(ROUTES.expense(id, expenseId))
    })

    it.each([
      ['the description', async () => user.type(descriptionInput(), '!')],
      ['the amount', async () => { await user.clear(amountInput()); await user.type(amountInput(), '10') }],
      ['the notes', async () => user.type(notesInput(), '!')],
      ['the category', async () => { await user.click(screen.getByRole('button', { name: /^Category: / })); await user.click(within(await screen.findByRole('dialog', { name: 'Choose a category' })).getByRole('button', { name: 'Taxi and ride-hailing' })) }],
    ])('asks "Discard your changes?" once %s is changed', async (_, change) => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const page = await open(id, expenseId)
      await change()

      await user.click(screen.getByRole('button', { name: 'Back' }))

      const dialog = await screen.findByRole('dialog', { name: 'Discard your changes?' })
      // It opens in the layer that stays in front while the page changes after it (ADR-060).
      expect(dialog.closest('[data-dialog-layer]')).not.toBeNull()
      expect(within(dialog).getByText('What you changed will be lost.')).toBeInTheDocument()
      expect(page.currentPath()).toBe(ROUTES.editExpense(id, expenseId))
    })

    it('keeps the changes on "Keep editing" and goes back without saving on "Discard"', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const page = await open(id, expenseId)
      await user.type(descriptionInput(), '!')
      await user.click(screen.getByRole('button', { name: 'Back' }))

      await user.click(within(await screen.findByRole('dialog', { name: 'Discard your changes?' })).getByRole('button', { name: 'Keep editing' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard your changes?' })).not.toBeInTheDocument())
      expect(descriptionInput()).toHaveValue('Beach shack dinner!')

      await user.click(screen.getByRole('button', { name: 'Back' }))
      await user.click(within(await screen.findByRole('dialog', { name: 'Discard your changes?' })).getByRole('button', { name: 'Discard' }))

      await waitFor(() => expect(page.currentPath()).toBe(ROUTES.expense(id, expenseId)))
      expect((await saved(expenseId)).expense.description).toBe('Beach shack dinner')
    })

    it('warns before the tab is closed only once something was changed', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await open(id, expenseId)

      const untouched = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(untouched)
      expect(untouched.defaultPrevented).toBe(false)

      await user.type(descriptionInput(), '!')
      const changed = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(changed)
      expect(changed.defaultPrevented).toBe(true)
    })
  })
})

describe('EditExpensePage: the category', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 20, 12, 0))
    useAuthStore.setState({ profile: me, token: null })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.mocked(getDb).mockClear()
  })

  it('is not picked from the description when it is changed (only Add expense does that)', async () => {
    const user = userEvent.setup()
    const groupId = await createGroup()
    const expenseId = await addExpense(groupId, { description: 'Beach shack dinner', category: 'food.dining_out' })
    renderEdit(groupId, expenseId)
    await screen.findByRole('heading', { name: 'Edit expense' })

    await user.clear(descriptionInput())
    await user.type(descriptionInput(), 'Netflix')

    expect(screen.getByRole('button', { name: /^Category: / })).toHaveAccessibleName('Category: Dining out')
  })
})
