// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { expenseShares, expenses, people } from '../../../db/schema.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpAddExpenseTests, me, amountInput, saveButton } from './helpers.tsx'

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

  describe('who paid and the split', () => {
    /** A group with Priya Shah and Sam (who has no name yet) besides you. */
    async function groupOfThree() {
      const id = await createGroup({ memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
      await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
      return id
    }

    async function fillIn(description: string, amount: string) {
      await user.type(await screen.findByRole('textbox', { name: 'Description' }), description)
      await user.type(amountInput(), amount)
    }

    async function openSplitOptions() {
      await user.click(screen.getByRole('button', { name: /^(equally|unequally)$/ }))
      return screen.findByRole('dialog', { name: 'Split options' })
    }

    /** The saved expense's method and each person's [paid, owed, entered]. */
    async function savedSplit() {
      const [expense] = await testDb.db.select().from(expenses)
      const shares = await testDb.db
        .select({ email: people.email, paid: expenseShares.paidMinor, owed: expenseShares.owedMinor, input: expenseShares.inputValue })
        .from(expenseShares)
        .innerJoin(people, eq(people.id, expenseShares.personId))
        .orderBy(people.email)
      return {
        method: expense.method,
        shares: Object.fromEntries(shares.map((share) => [share.email.split('@')[0], [share.paid, share.owed, share.input]])),
      }
    }

    /** The texts of a dialog's buttons, leaving out its close button. */
    function choicesIn(dialog: HTMLElement) {
      return within(dialog)
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-label') !== 'Close')
        .map((button) => button.textContent)
    }

    function sentence() {
      return (screen.getByRole('button', { name: /^(equally|unequally)$/ }).closest('.ant-typography') as HTMLElement)
        .textContent
    }

    it('lets another member be the payer, naming them by first name', async () => {
      const id = await groupOfThree()
      renderForm(id)
      await fillIn('Dinner', '9')

      await user.click(screen.getByRole('button', { name: 'you' }))
      const dialog = await screen.findByRole('dialog', { name: 'Who paid?' })
      expect(choicesIn(dialog)).toEqual([
        'You',
        'Priya Shah',
        'sam@gmail.com',
        'Multiple people',
      ])
      expect(within(dialog).getByRole('button', { name: 'Multiple people' })).toBeDisabled()
      await user.click(within(dialog).getByRole('button', { name: 'Priya Shah' }))

      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Who paid?' })).not.toBeInTheDocument())
      expect(sentence()).toBe('Paid by Priya and split equally')

      await user.click(saveButton())
      await screen.findByText('Expense added.')
      expect(await savedSplit()).toEqual({
        method: 'equal',
        shares: { omkar: [0, 300, 1], priya: [900, 300, 1], sam: [0, 300, 1] },
      })
    })

    it('splits by exact amounts, showing what is left, and saves them', async () => {
      const id = await groupOfThree()
      renderForm(id)
      await fillIn('Dinner', '10')
      const dialog = await openSplitOptions()

      await user.click(within(dialog).getByRole('tab', { name: 'Amounts' }))
      expect(within(dialog).getByText('Split by exact amounts')).toBeInTheDocument()
      await user.type(within(dialog).getByRole('textbox', { name: 'Amount for you' }), '2.5')
      expect(within(dialog).getByText('£2.50 of £10.00')).toBeInTheDocument()
      expect(within(dialog).getByText('£7.50 left')).toBeInTheDocument()
      await user.type(within(dialog).getByRole('textbox', { name: 'Amount for Priya Shah' }), '7.5')
      expect(within(dialog).getByText('£0.00 left')).toHaveClass('ant-typography-success')

      await user.click(within(dialog).getByRole('button', { name: 'Done' }))

      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Split options' })).not.toBeInTheDocument())
      expect(sentence()).toBe('Paid by you and split unequally')
      await user.click(saveButton())
      await screen.findByText('Expense added.')
      expect(await savedSplit()).toEqual({
        method: 'exact',
        shares: { omkar: [1000, 250, 250], priya: [0, 750, 750], sam: [0, 0, 0] },
      })
    })

    it('keeps the dialog open and says why when the split does not add up', async () => {
      const id = await groupOfThree()
      renderForm(id)
      await fillIn('Dinner', '10')
      const dialog = await openSplitOptions()

      await user.click(within(dialog).getByRole('tab', { name: 'Amounts' }))
      await user.type(within(dialog).getByRole('textbox', { name: 'Amount for you' }), '12')
      expect(within(dialog).getByText('£2.00 over')).toHaveClass('ant-typography-danger')
      await user.click(within(dialog).getByRole('button', { name: 'Done' }))

      expect(within(dialog).getByRole('alert')).toHaveTextContent('The split no longer adds up.')
      expect(screen.getByRole('dialog', { name: 'Split options' })).toBeInTheDocument()
      // Editing clears the message.
      await user.clear(within(dialog).getByRole('textbox', { name: 'Amount for you' }))
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    })

    it('asks for the amount before amounts can be split', async () => {
      const id = await groupOfThree()
      renderForm(id)
      await screen.findByRole('heading', { name: 'Add expense' })
      const dialog = await openSplitOptions()

      await user.click(within(dialog).getByRole('tab', { name: 'Adjust' }))
      await user.click(within(dialog).getByRole('button', { name: 'Done' }))

      expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter the amount first.')
    })

    it('splits by percentages and by shares, showing what each part comes to', async () => {
      const id = await groupOfThree()
      renderForm(id)
      await fillIn('Rent', '10')
      const dialog = await openSplitOptions()

      await user.click(within(dialog).getByRole('tab', { name: 'Percent' }))
      await user.type(within(dialog).getByRole('textbox', { name: 'Percentage for you' }), '50')
      await user.type(within(dialog).getByRole('textbox', { name: 'Percentage for Priya Shah' }), '5x0')
      expect(within(dialog).getByText('100% of 100%')).toBeInTheDocument()
      expect(within(dialog).getAllByText('£5.00')).toHaveLength(2)

      await user.click(within(dialog).getByRole('tab', { name: 'Shares' }))
      await user.type(within(dialog).getByRole('textbox', { name: 'Shares for you' }), '2')
      await user.type(within(dialog).getByRole('textbox', { name: 'Shares for Priya Shah' }), '1')
      await user.type(within(dialog).getByRole('textbox', { name: 'Shares for sam@gmail.com' }), '1')
      expect(within(dialog).getByText('4 shares in all')).toBeInTheDocument()
      expect(within(dialog).getByText('£5.00')).toBeInTheDocument()
      expect(within(dialog).getAllByText('£2.50')).toHaveLength(2)

      await user.click(within(dialog).getByRole('button', { name: 'Done' }))
      await user.click(saveButton())
      await screen.findByText('Expense added.')
      expect(await savedSplit()).toEqual({
        method: 'shares',
        shares: { omkar: [1000, 500, 2], priya: [0, 250, 1], sam: [0, 250, 1] },
      })
    })

    it('splits equally between only some people, the payer included or not', async () => {
      const id = await groupOfThree()
      renderForm(id)
      await fillIn('Taxi', '10')
      const dialog = await openSplitOptions()

      await user.click(within(dialog).getByRole('checkbox', { name: 'Split with you' }))
      expect(within(dialog).getByText('£5.00/person (2 people)')).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Done' }))

      // An equal split, even between some, still reads "equally".
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Split options' })).not.toBeInTheDocument())
      expect(sentence()).toBe('Paid by you and split equally')
      await user.click(saveButton())
      await screen.findByText('Expense added.')
      expect(await savedSplit()).toEqual({
        method: 'equal',
        shares: { omkar: [1000, 0, 0], priya: [0, 500, 1], sam: [0, 500, 1] },
      })
    })

    it('refuses an equal split with nobody ticked', async () => {
      const id = await groupOfThree()
      renderForm(id)
      await fillIn('Taxi', '10')
      const dialog = await openSplitOptions()

      for (const name of ['you', 'Priya Shah', 'sam@gmail.com']) {
        await user.click(within(dialog).getByRole('checkbox', { name: `Split with ${name}` }))
      }
      await user.click(within(dialog).getByRole('button', { name: 'Done' }))

      expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose at least one person.')
    })

    it('changes the payer from the dropdown at the top of the split options', async () => {
      const id = await groupOfThree()
      renderForm(id)
      await fillIn('Taxi', '10')
      const dialog = await openSplitOptions()

      await user.click(within(dialog).getByRole('combobox', { name: 'Paid by' }))
      await user.click(
        [...document.querySelectorAll('.ant-select-item-option-content')].find(
          (option) => option.textContent === 'Priya Shah',
        ) as HTMLElement,
      )
      await user.click(within(dialog).getByRole('button', { name: 'Done' }))

      await waitFor(() => expect(sentence()).toBe('Paid by Priya and split equally'))
    })

    it('says the split no longer adds up when the amount changes after exact amounts, and will not save', async () => {
      const id = await groupOfThree()
      renderForm(id)
      await fillIn('Dinner', '10')
      const dialog = await openSplitOptions()
      await user.click(within(dialog).getByRole('tab', { name: 'Amounts' }))
      await user.type(within(dialog).getByRole('textbox', { name: 'Amount for you' }), '10')
      await user.click(within(dialog).getByRole('button', { name: 'Done' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Split options' })).not.toBeInTheDocument())
      expect(screen.queryByText('The split no longer adds up.')).not.toBeInTheDocument()

      await user.type(amountInput(), '0')

      expect(await screen.findByText('The split no longer adds up.')).toBeInTheDocument()
      await user.click(saveButton())
      await waitFor(() => expect(screen.getAllByText('The split no longer adds up.')).toHaveLength(1))
      expect(await testDb.db.select().from(expenses)).toEqual([])

      // Putting the amount back makes it add up again.
      await user.type(amountInput(), '{Backspace}')
      await waitFor(() => expect(screen.queryByText('The split no longer adds up.')).not.toBeInTheDocument())
    })

    describe('in a group of two', () => {
      async function groupOfTwo() {
        const id = await createGroup({ memberEmails: ['priya@gmail.com'] })
        await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
        return id
      }

      it('offers four quick choices in one button', async () => {
        const id = await groupOfTwo()
        renderForm(id)
        await fillIn('Cinema', '20')

        await user.click(screen.getByRole('button', { name: 'You paid, split equally' }))
        const dialog = await screen.findByRole('dialog', { name: 'How was it paid and split?' })
        expect(choicesIn(dialog)).toEqual([
          'You paid, split equally',
          'You are owed the full amount',
          'Priya paid, split equally',
          'Priya is owed the full amount',
          'More options',
        ])
        expect(within(dialog).getByRole('button', { name: 'You paid, split equally' })).toHaveAttribute('aria-pressed', 'true')

        await user.click(within(dialog).getByRole('button', { name: 'Priya is owed the full amount' }))
        expect(await screen.findByRole('button', { name: 'Priya is owed the full amount' })).toBeInTheDocument()

        await user.click(saveButton())
        await screen.findByText('Expense added.')
        expect(await savedSplit()).toEqual({
          method: 'equal',
          shares: { omkar: [0, 2000, 1], priya: [2000, 0, 0] },
        })
      })

      it('shows the full sentence once the split is not one of the quick choices', async () => {
        const id = await groupOfTwo()
        renderForm(id)
        await fillIn('Cinema', '20')

        await user.click(screen.getByRole('button', { name: 'You paid, split equally' }))
        await user.click(within(await screen.findByRole('dialog', { name: 'How was it paid and split?' })).getByRole('button', { name: 'More options' }))
        const dialog = await screen.findByRole('dialog', { name: 'Split options' })
        await user.click(within(dialog).getByRole('tab', { name: 'Shares' }))
        await user.type(within(dialog).getByRole('textbox', { name: 'Shares for you' }), '3')
        await user.type(within(dialog).getByRole('textbox', { name: 'Shares for Priya Shah' }), '1')
        await user.click(within(dialog).getByRole('button', { name: 'Done' }))

        await waitFor(() => expect(sentence()).toBe('Paid by you and split unequally'))
      })
    })

    it('counts a change of payer as input when leaving', async () => {
      const id = await groupOfThree()
      renderForm(id)
      await user.click(await screen.findByRole('button', { name: 'you' }))
      await user.click(within(await screen.findByRole('dialog', { name: 'Who paid?' })).getByRole('button', { name: 'Priya Shah' }))

      await user.click(screen.getByRole('button', { name: 'Back' }))

      expect(await screen.findByRole('dialog', { name: 'Discard this expense?' })).toBeInTheDocument()
    })
  })
})
