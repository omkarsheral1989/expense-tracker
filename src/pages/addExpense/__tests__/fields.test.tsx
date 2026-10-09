// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { groupService } from '../../../services/groupService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { addTestExpense } from '../../../testing/expenses.ts'
import { setUpAddExpenseTests, me, descriptionInput, amountInput, notesInput, typeAsBrowser, currencySection } from './helpers.tsx'

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

  describe('what is switched off', () => {
    it('reads "Paid by you and split equally", with both buttons off in a group of one', async () => {
      const id = await createGroup()
      renderForm(id)

      const you = await screen.findByRole('button', { name: 'you' })
      const sentence = you.closest('.ant-typography') as HTMLElement
      expect(sentence).toHaveTextContent('Paid by you and split equally')
      expect(you).toBeDisabled()
      expect(screen.getByRole('button', { name: 'equally' })).toBeDisabled()
      await user.hover(you.parentElement as HTMLElement)
      expect(await screen.findByText('You are the only member of this group.')).toBeInTheDocument()
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
        await addTestExpense(testDb.db, me.email, id, { currency })
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
})
