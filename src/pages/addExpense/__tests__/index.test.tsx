// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { expenseShares, expenses, people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { expenseService } from '../../../services/expenseService'
import { groupService } from '../../../services/groupService'
import type { CreateGroupInput } from '../../../services/groupService/types.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { renderPage } from '../../../testing/render.tsx'
import { AddExpensePage } from '../index.tsx'

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

async function createGroup(input: Partial<CreateGroupInput> = {}) {
  const result = await groupService.createGroup(testDb.db, me, {
    name: 'Goa trip',
    type: 'trip',
    defaultCurrency: 'GBP',
    memberEmails: [],
    ...input,
  })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.groupId
}

function renderForm(groupId: string) {
  return renderPage(<AddExpensePage />, {
    path: ROUTES.newExpense(groupId),
    pattern: ROUTES.newExpensePattern,
    routes: [ROUTES.groupPattern, ROUTES.home],
  })
}

/**
 * Matches a button by its text. Ant Design icons add their own name in front
 * ("calendar Today, 8 Oct 2026"), so the text is matched at the end.
 */
function named(text: string) {
  return new RegExp(`(^|\\s)${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
}

const descriptionInput = () => screen.getByRole('textbox', { name: 'Description' })
const amountInput = () => screen.getByRole('textbox', { name: 'Amount' })
const notesInput = () => screen.getByRole('textbox', { name: 'Notes' })
const saveButton = () => screen.getByRole('button', { name: 'Save' })

/**
 * Changes a field the way the browser does when a key is typed: the new text
 * and the caret's position, then an input event. The value is set with the
 * browser's own setter, so React sees it as typed rather than set by itself.
 */
function typeAsBrowser(input: HTMLInputElement, value: string, caret: number) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setValue?.call(input, value)
  input.setSelectionRange(caret, caret)
  fireEvent.input(input)
}

/** The form row of a field, to look for the message shown under it. */
function fieldOf(input: HTMLElement) {
  return input.closest('.ant-form-item') as HTMLElement
}

/** The names of the entries of a section ("Recent") of the currency picker. */
function currencySection(dialog: HTMLElement, name: string) {
  return within(within(dialog).getByRole('group', { name }))
    .getAllByRole('button')
    .map((button) => button.textContent)
}

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

  describe('when it opens', () => {
    it('shows grey placeholders while the group loads', async () => {
      const id = await createGroup()
      vi.mocked(getDb).mockImplementationOnce(() => new Promise(() => {}))
      renderForm(id)

      expect(screen.getByRole('status', { name: 'Loading the group' })).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument()
    })

    it('starts with General, the group\'s currency, today and nothing typed', async () => {
      const id = await createGroup({ defaultCurrency: 'EUR' })
      renderForm(id)

      expect(await screen.findByRole('heading', { name: 'Add expense' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Category: General' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Currency: EUR' })).toHaveTextContent('EUR')
      expect(screen.getByRole('button', { name: 'Date: Today, 8 Oct 2026' })).toHaveTextContent(
        'Today, 8 Oct 2026',
      )
      expect(descriptionInput()).toHaveValue('')
      expect(amountInput()).toHaveValue('')
      expect(amountInput()).toHaveAttribute('placeholder', '0.00')
      expect(amountInput()).toHaveAttribute('inputmode', 'decimal')
      expect(notesInput()).toHaveValue('')
    })

    it('says the expense is shared with the whole group', async () => {
      const id = await createGroup({ name: 'Flat 4B' })
      renderForm(id)

      expect(await screen.findByText('With you and:')).toBeInTheDocument()
      expect(screen.getByText('All of Flat 4B')).toBeInTheDocument()
    })

    it('is titled "Add expense · OwnLedger"', async () => {
      const id = await createGroup()
      renderForm(id)

      await screen.findByRole('heading', { name: 'Add expense' })
      await waitFor(() => expect(document.title).toBe('Add expense · OwnLedger'))
    })

    it('shows "Group not found" for a group the user is not in', async () => {
      const result = await groupService.createGroup(testDb.db, { email: 'priya@gmail.com', name: 'Priya' }, {
        name: 'Not mine',
        type: 'trip',
        defaultCurrency: 'GBP',
        memberEmails: [],
      })
      if (!result.ok) throw new Error('setup failed')
      renderForm(result.groupId)

      expect(await screen.findByText('Group not found')).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument()
      await waitFor(() => expect(document.title).toBe('Group not found · OwnLedger'))
    })

    it('says so when the group cannot be loaded, and loads it on "Try again"', async () => {
      const id = await createGroup()
      vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))
      renderForm(id)

      expect(await screen.findByText("Couldn't load this group")).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Try again' }))
      expect(await screen.findByRole('heading', { name: 'Add expense' })).toBeInTheDocument()
    })
  })

  describe('what is switched off for now', () => {
    it.each([
      ['Paid by', 'you'],
      ['split', 'equally'],
    ])('shows "%s [%s]" with its button switched off, saying "Coming soon"', async (_, name) => {
      const id = await createGroup({ memberEmails: ['priya@gmail.com'] })
      renderForm(id)

      const button = await screen.findByRole('button', { name })
      expect(button).toBeDisabled()
      await user.hover(button.parentElement as HTMLElement)
      expect(await screen.findByText('Coming soon')).toBeInTheDocument()
    })

    it('reads "Paid by you and split equally"', async () => {
      const id = await createGroup()
      renderForm(id)

      const you = await screen.findByRole('button', { name: 'you' })
      const sentence = you.closest('.ant-typography') as HTMLElement
      expect(sentence).toHaveTextContent('Paid by you and split equally')
    })

    it('switches off adding receipt photos, saying "Coming soon"', async () => {
      const id = await createGroup()
      renderForm(id)

      const button = await screen.findByRole('button', { name: named('Add receipt photos') })
      expect(button).toBeDisabled()
      await user.hover(button.parentElement as HTMLElement)
      expect(await screen.findByText('Coming soon')).toBeInTheDocument()
    })
  })

  describe('the amount', () => {
    it.each([
      ['GBP', '1234567.891', '1,234,567.89'],
      ['INR', '1234567.891', '12,34,567.89'],
      ['JPY', '12345.6', '123,456'],
      ['GBP', 'abc12,5x', '125'],
      ['GBP', '0012.5.0', '12.50'],
    ])('in %s, typing %j shows %j', async (currency, typed, shown) => {
      const id = await createGroup({ defaultCurrency: currency })
      renderForm(id)

      await user.type(await screen.findByRole('textbox', { name: 'Amount' }), typed)

      expect(amountInput()).toHaveValue(shown)
    })

    it('keeps the caret after the digit just typed, even as separators appear', async () => {
      const id = await createGroup()
      renderForm(id)
      const input = (await screen.findByRole('textbox', { name: 'Amount' })) as HTMLInputElement
      await user.type(input, '1234')
      expect(input).toHaveValue('1,234')

      // As a browser does when "9" is typed after the "1": the raw text, with
      // the caret after the new digit. Setting the reformatted value would
      // otherwise throw the caret to the end.
      typeAsBrowser(input, '19,234', 2)
      expect(input).toHaveValue('19,234')
      expect(input.selectionStart).toBe(2)

      // "7" typed after "198" adds a separator before the caret: the caret
      // still sits right after the 7.
      typeAsBrowser(input, '198,234', 3)
      typeAsBrowser(input, '1987,234', 4)
      expect(input).toHaveValue('1,987,234')
      expect(input.selectionStart).toBe(5)
    })

    it('shows "0" as the placeholder for a currency without decimals', async () => {
      const id = await createGroup({ defaultCurrency: 'JPY' })
      renderForm(id)

      expect(await screen.findByRole('textbox', { name: 'Amount' })).toHaveAttribute('placeholder', '0')
    })
  })

  describe('the currency', () => {
    async function openCurrencies() {
      await user.click(await screen.findByRole('button', { name: /^Currency: / }))
      return screen.findByRole('dialog', { name: 'Choose a currency' })
    }

    it('lists the group\'s currency and your latest ones under Recent, then all currencies', async () => {
      const id = await createGroup()
      for (const currency of ['USD', 'INR']) {
        await expenseService.createExpense(testDb.db, me.email, id, {
          description: 'Earlier',
          category: 'general',
          amountMinor: 100,
          currency,
          date: '2026-10-01',
          notes: '',
        })
      }
      renderForm(id)

      const dialog = await openCurrencies()

      const recent = currencySection(dialog, 'Recent')
      expect(recent).toHaveLength(3)
      expect(recent[0]).toMatch(/^GBP – British Pound/)
      expect(recent.slice(1).map((label) => label?.slice(0, 3)).sort()).toEqual(['INR', 'USD'])
      const all = currencySection(dialog, 'All currencies')
      expect(all.length).toBeGreaterThan(100)
      expect(all.map((label) => label?.slice(0, 3))).toEqual(
        all.map((label) => label?.slice(0, 3)).toSorted(),
      )
    })

    it('finds a currency by name or code, and uses the one picked', async () => {
      const id = await createGroup()
      renderForm(id)
      const dialog = await openCurrencies()

      await user.type(within(dialog).getByRole('textbox', { name: 'Search currencies' }), 'yen')
      expect(currencySection(dialog, 'Search results')).toEqual(['JPY – Japanese Yen (¥)'])

      await user.click(within(dialog).getByRole('button', { name: /^JPY/ }))

      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose a currency' })).not.toBeInTheDocument())
      expect(screen.getByRole('button', { name: 'Currency: JPY' })).toBeInTheDocument()
    })

    it('says when no currency matches the search', async () => {
      const id = await createGroup()
      renderForm(id)
      const dialog = await openCurrencies()

      await user.type(within(dialog).getByRole('textbox', { name: 'Search currencies' }), 'zzzz')

      expect(within(dialog).getByText('No currency matches')).toBeInTheDocument()
    })

    it.each([
      ['JPY', '12.5', '13'],
      ['JPY', '1234.4', '1,234'],
      ['KWD', '12.5', '12.5'],
    ])('rounds the amount for the new currency: %s turns %j into %j', async (code, typed, shown) => {
      const id = await createGroup()
      renderForm(id)
      await user.type(await screen.findByRole('textbox', { name: 'Amount' }), typed)

      const dialog = await openCurrencies()
      await user.type(within(dialog).getByRole('textbox', { name: 'Search currencies' }), code)
      await user.click(within(dialog).getByRole('button', { name: new RegExp(`^${code}`) }))

      await waitFor(() => expect(amountInput()).toHaveValue(shown))
    })
  })

  describe('the category', () => {
    async function openCategories() {
      await user.click(await screen.findByRole('button', { name: /^Category: / }))
      return screen.findByRole('dialog', { name: 'Choose a category' })
    }

    it('lists every category under its group, with General marked as chosen', async () => {
      const id = await createGroup()
      renderForm(id)
      const dialog = await openCategories()

      const groups = within(dialog).getAllByRole('group').map((group) => group.getAttribute('aria-label'))
      expect(groups).toEqual([
        'Entertainment',
        'Food and drink',
        'Home',
        'Life',
        'Transportation',
        'Uncategorized',
        'Utilities',
      ])
      const food = within(within(dialog).getByRole('group', { name: 'Food and drink' })).getAllByRole('button')
      expect(food.map((button) => button.getAttribute('aria-label'))).toEqual([
        'Dining out',
        'Groceries',
        'Liquor',
        'Food and drink: Other',
      ])
      expect(within(dialog).getByRole('button', { name: 'General' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(dialog).getByRole('button', { name: 'Groceries' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('uses the category picked', async () => {
      const id = await createGroup()
      renderForm(id)
      const dialog = await openCategories()

      await user.click(within(dialog).getByRole('button', { name: 'Food and drink: Other' }))

      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose a category' })).not.toBeInTheDocument())
      expect(screen.getByRole('button', { name: 'Category: Food and drink: Other' })).toBeInTheDocument()
    })
  })

  describe('the date', () => {
    it('can be any day picked in the calendar', async () => {
      const id = await createGroup()
      renderForm(id)

      await user.click(await screen.findByRole('button', { name: 'Date: Today, 8 Oct 2026' }))
      const dialog = await screen.findByRole('dialog', { name: 'Choose a date' })
      await user.click(dialog.querySelector('td[title="2026-10-07"]') as HTMLElement)

      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose a date' })).not.toBeInTheDocument())
      expect(screen.getByRole('button', { name: 'Date: Yesterday, 7 Oct 2026' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /^Date: / }))
      const again = await screen.findByRole('dialog', { name: 'Choose a date' })
      await user.click(again.querySelector('td[title="2026-10-20"]') as HTMLElement)
      expect(await screen.findByRole('button', { name: 'Date: Tue, 20 Oct 2026' })).toBeInTheDocument()
    })

    it('only moves the calendar when another month is chosen in its header', async () => {
      const id = await createGroup()
      renderForm(id)
      await user.click(await screen.findByRole('button', { name: /^Date: / }))
      const dialog = await screen.findByRole('dialog', { name: 'Choose a date' })

      const [, month] = within(dialog).getAllByRole('combobox')
      await user.click(month)
      await user.click(
        [...document.querySelectorAll('.ant-select-item-option-content')].find(
          (option) => option.textContent === 'Sep',
        ) as HTMLElement,
      )

      // 1 Sep is only on screen once the calendar shows September.
      expect(dialog.querySelector('td[title="2026-09-01"]')).not.toBeNull()
      expect(screen.getByRole('dialog', { name: 'Choose a date' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Date: Today, 8 Oct 2026' })).toBeInTheDocument()
    })
  })

  describe('the notes', () => {
    it('shows how many characters are used only near the 1000 limit, and stops there', async () => {
      const id = await createGroup()
      renderForm(id)
      const notes = await screen.findByRole('textbox', { name: 'Notes' })

      await user.click(notes)
      await user.paste('a'.repeat(899))
      expect(screen.queryByText('899 / 1000')).not.toBeInTheDocument()

      await user.type(notes, 'b')
      expect(screen.getByText('900 / 1000')).toBeInTheDocument()

      await user.paste('c'.repeat(200))
      expect(notes).toHaveValue(`${'a'.repeat(899)}b${'c'.repeat(100)}`)
      expect(screen.getByText('1000 / 1000')).toBeInTheDocument()
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
