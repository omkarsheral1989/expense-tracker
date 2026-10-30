// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { eq } from 'drizzle-orm'
import { accounts, expenses, people } from '../../../db/schema.ts'
import { accountService } from '../../../services/accountService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { personIdOf } from '../../../testing/expenses.ts'
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

describe('the payment method on the add-expense page (PRD 5.5, 4.10)', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0))
    user = userEvent.setup()
    useAuthStore.setState({ profile: me, token: null })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** A group (GBP) with Priya Shah and Sam, and two accounts of the user's: a GBP bank account and an INR credit card. */
  async function groupWithAccounts() {
    const groupId = await createGroup({ memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
    await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
    const userId = await personIdOf(testDb.db, me.email)
    const save = async (input: Parameters<typeof accountService.createAccount>[2]) => {
      const result = await accountService.createAccount(testDb.db, userId, input)
      if (!result.ok) throw new Error('account not created')
      return result.accountId
    }
    const savings = await save({ kind: 'bank', name: 'Barclays Savings', currency: 'GBP' })
    const forex = await save({ kind: 'card', name: 'Forex card', currency: 'INR', spendTargetMinor: 600000, spendTargetPeriod: 'month' })
    return { groupId, userId, savings, forex }
  }

  const paymentRow = () => screen.getByRole('button', { name: /^Payment method/ })

  async function openPicker() {
    await user.click(paymentRow())
    return screen.findByRole('dialog', { name: 'Payment method' })
  }

  const cardOf = (dialog: HTMLElement, name: string) => within(dialog).getByRole('button', { name })

  /** A sheet found by its title: in jsdom every sheet has the same accessible name when one is over another. */
  async function findSheet(title: string) {
    return (await screen.findByText(title, { selector: '.ant-drawer-title, .ant-modal-title' })).closest('[role="dialog"]') as HTMLElement
  }

  async function describeExpense(description = 'Dinner', amount = '100') {
    await user.type(await screen.findByRole('textbox', { name: 'Description' }), description)
    await user.type(amountInput(), amount)
  }

  /** The payment method saved for the only expense, or null. */
  async function savedPaymentMethod() {
    const [expense] = await testDb.db.select().from(expenses)
    return accountService.getPaymentMethod(testDb.db, expense.id)
  }

  it('shows a Payment method row for the payer, even before there is an account', async () => {
    renderForm(await createGroup())

    expect(await screen.findByRole('button', { name: 'Payment method' })).toBeInTheDocument()
  })

  it('has the form class that gives every gap on the page the same 16 px (CSS: src/index.css)', async () => {
    const { container } = renderForm(await createGroup())
    await screen.findByRole('textbox', { name: 'Description' })

    expect(container.querySelector('form')).toHaveClass('expense-form')
  })

  it('puts the row between the sentence about who paid and the date', async () => {
    renderForm(await createGroup())
    await screen.findByRole('textbox', { name: 'Description' })

    const row = paymentRow()
    const sentence = screen.getByRole('button', { name: 'you' })
    const date = screen.getByRole('button', { name: /^Date:/ })
    expect(sentence.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(row.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  describe('the picker', () => {
    it('offers only "None" and an Add account button before there is an account', async () => {
      renderForm(await createGroup())
      await screen.findByRole('textbox', { name: 'Description' })

      const dialog = await openPicker()

      expect(cardOf(dialog, 'None')).toHaveAttribute('aria-pressed', 'true')
      expect(within(dialog).getByRole('button', { name: /Add account$/ })).toBeInTheDocument()
      // No account cards: "None" is the only card.
      expect(dialog.querySelectorAll('.ant-card')).toHaveLength(1)
    })

    it('lists the accounts as cards, "None" ticked to start, with a card\'s spend tiles', async () => {
      const { groupId } = await groupWithAccounts()
      renderForm(groupId)
      await screen.findByRole('textbox', { name: 'Description' })

      const dialog = await openPicker()

      expect(cardOf(dialog, 'None')).toHaveAttribute('aria-pressed', 'true')
      expect(cardOf(dialog, 'Barclays Savings')).toHaveAttribute('aria-pressed', 'false')
      expect(within(cardOf(dialog, 'Barclays Savings')).getByText(/£ · Bank account$/)).toBeInTheDocument()
      expect(within(cardOf(dialog, 'Barclays Savings')).queryByText('Spend target')).not.toBeInTheDocument()
      expect(within(cardOf(dialog, 'Forex card')).getByText('Spend target')).toBeInTheDocument()
      expect(within(cardOf(dialog, 'Forex card')).getByText(/₹ · Credit card$/)).toBeInTheDocument()
    })

    it('puts the chosen account on the row, and closes', async () => {
      const { groupId } = await groupWithAccounts()
      renderForm(groupId)
      await screen.findByRole('textbox', { name: 'Description' })

      await user.click(cardOf(await openPicker(), 'Barclays Savings'))

      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Payment method' })).not.toBeInTheDocument())
      expect(screen.getByRole('button', { name: 'Payment method: Barclays Savings' })).toBeInTheDocument()
      expect(cardOf(await openPicker(), 'Barclays Savings')).toHaveAttribute('aria-pressed', 'true')
    })

    it('takes it off again with "None"', async () => {
      const { groupId } = await groupWithAccounts()
      renderForm(groupId)
      await screen.findByRole('textbox', { name: 'Description' })
      await user.click(cardOf(await openPicker(), 'Barclays Savings'))

      await user.click(cardOf(await openPicker(), 'None'))

      await waitFor(() => expect(screen.getByRole('button', { name: 'Payment method' })).toBeInTheDocument())
    })

    it('adds an account from its Add account button and chooses it at once', async () => {
      renderForm(await createGroup())
      await screen.findByRole('textbox', { name: 'Description' })

      const picker = await openPicker()
      await user.click(within(picker).getByRole('button', { name: /Add account$/ }))
      const dialog = await findSheet('Add account')
      await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Monzo')
      await user.click(within(dialog).getByRole('button', { name: 'Add' }))

      expect(await screen.findByRole('button', { name: 'Payment method: Monzo' })).toBeInTheDocument()
      expect((await testDb.db.select().from(accounts)).map((row) => row.name)).toEqual(['Monzo'])
    })
  })

  describe('saving', () => {
    it('saves no payment method when none was chosen', async () => {
      const { groupId } = await groupWithAccounts()
      renderForm(groupId)
      await describeExpense()

      await user.click(saveButton())
      await screen.findByText('Expense added.')

      expect(await savedPaymentMethod()).toBeNull()
    })

    it('saves the chosen account for the expense', async () => {
      const { groupId, savings } = await groupWithAccounts()
      renderForm(groupId)
      await describeExpense()
      await user.click(cardOf(await openPicker(), 'Barclays Savings'))

      await user.click(saveButton())
      await screen.findByText('Expense added.')

      expect(await savedPaymentMethod()).toMatchObject({ accountId: savings, accountName: 'Barclays Savings', chargedMinor: null })
    })

    it('says so, and keeps the expense, when the payment method cannot be saved', async () => {
      const { groupId } = await groupWithAccounts()
      renderForm(groupId)
      await describeExpense()
      await user.click(cardOf(await openPicker(), 'Barclays Savings'))
      vi.spyOn(accountService, 'setPaymentMethod').mockRejectedValue(new Error('disk full'))

      await user.click(saveButton())

      expect(await screen.findByText("Expense added, but the payment method couldn't be saved. Edit the expense to add it.")).toBeInTheDocument()
      expect(await testDb.db.select().from(expenses)).toHaveLength(1)
    })
  })

  describe('the amount charged to the account, when its currency is another one', () => {
    const chargedInput = () => screen.getByRole('textbox', { name: 'Charged to the account' })

    it('is not asked for when the account is in the expense\'s currency', async () => {
      const { groupId } = await groupWithAccounts()
      renderForm(groupId)
      await describeExpense()

      await user.click(cardOf(await openPicker(), 'Barclays Savings'))

      expect(screen.queryByRole('textbox', { name: 'Charged to the account' })).not.toBeInTheDocument()
    })

    it('is asked for in the account\'s currency, left-aligned after its symbol, once the account is another currency', async () => {
      const { groupId } = await groupWithAccounts()
      renderForm(groupId)
      await describeExpense()

      await user.click(cardOf(await openPicker(), 'Forex card'))

      expect(chargedInput()).toHaveAttribute('placeholder', '0.00')
      expect(chargedInput().closest('.ant-input-affix-wrapper')).toHaveTextContent('₹')
      expect(chargedInput()).toHaveStyle({ textAlign: 'start' })
      expect(screen.getByText('Charged to the account')).toBeInTheDocument()
    })

    it('says an expense without it is not counted toward a card\'s spend, and a bank account just says optional', async () => {
      const { groupId } = await groupWithAccounts()
      const userId = await personIdOf(testDb.db, me.email)
      await accountService.createAccount(testDb.db, userId, { kind: 'bank', name: 'Rupee bank', currency: 'INR' })
      renderForm(groupId)
      await describeExpense()

      await user.click(cardOf(await openPicker(), 'Forex card'))
      expect(screen.getByText("Optional. Without it, this expense is not counted toward the card's spend.")).toBeInTheDocument()

      await user.click(cardOf(await openPicker(), 'Rupee bank'))
      expect(screen.queryByText(/not counted toward/)).not.toBeInTheDocument()
      expect(screen.getByText('Optional.')).toBeInTheDocument()
    })

    it('shows the rate both ways as the amounts are typed', async () => {
      const { groupId } = await groupWithAccounts()
      renderForm(groupId)
      await describeExpense('Dinner', '100')
      await user.click(cardOf(await openPicker(), 'Forex card'))

      await user.type(chargedInput(), '12000')

      expect(await screen.findByText(/^£1 ≈ ₹120\.00\s+·\s+₹1 ≈ £0\.0083$/)).toBeInTheDocument()
    })

    it('saves what the account was charged with the payment method', async () => {
      const { groupId, forex } = await groupWithAccounts()
      renderForm(groupId)
      await describeExpense('Dinner', '100')
      await user.click(cardOf(await openPicker(), 'Forex card'))
      await user.type(chargedInput(), '12000.5')

      await user.click(saveButton())
      await screen.findByText('Expense added.')

      expect(await savedPaymentMethod()).toMatchObject({ accountId: forex, chargedMinor: 1200050 })
    })

    it('may be left empty', async () => {
      const { groupId } = await groupWithAccounts()
      renderForm(groupId)
      await describeExpense('Dinner', '100')
      await user.click(cardOf(await openPicker(), 'Forex card'))

      await user.click(saveButton())
      await screen.findByText('Expense added.')

      expect(await savedPaymentMethod()).toMatchObject({ accountName: 'Forex card', chargedMinor: null })
    })

    it('starts again when another account is chosen', async () => {
      const { groupId } = await groupWithAccounts()
      renderForm(groupId)
      await describeExpense('Dinner', '100')
      await user.click(cardOf(await openPicker(), 'Forex card'))
      await user.type(chargedInput(), '500')

      await user.click(cardOf(await openPicker(), 'Barclays Savings'))
      await user.click(cardOf(await openPicker(), 'Forex card'))

      expect(chargedInput()).toHaveValue('')
    })

    it('keeps what was typed when only the amount of the expense changes', async () => {
      const { groupId } = await groupWithAccounts()
      renderForm(groupId)
      await describeExpense('Dinner', '100')
      await user.click(cardOf(await openPicker(), 'Forex card'))
      await user.type(chargedInput(), '500')

      await user.type(amountInput(), '5')

      expect(chargedInput()).toHaveValue('500')
    })
  })

  describe('when someone else pays', () => {
    async function payBy(name: string) {
      await user.click(screen.getByRole('button', { name: 'you' }))
      const dialog = await screen.findByRole('dialog', { name: 'Who paid?' })
      await user.click(within(dialog).getByRole('button', { name: new RegExp(name) }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Who paid?' })).not.toBeInTheDocument())
    }

    it('takes the row away, and clears the account chosen', async () => {
      const { groupId } = await groupWithAccounts()
      renderForm(groupId)
      await describeExpense()
      await user.click(cardOf(await openPicker(), 'Barclays Savings'))

      await payBy('Priya Shah')

      expect(screen.queryByRole('button', { name: /^Payment method/ })).not.toBeInTheDocument()
    })

    it('starts empty again when the user pays after all', async () => {
      const { groupId } = await groupWithAccounts()
      renderForm(groupId)
      await describeExpense()
      await user.click(cardOf(await openPicker(), 'Barclays Savings'))
      await payBy('Priya Shah')

      await user.click(screen.getByRole('button', { name: 'Priya' }))
      const dialog = await screen.findByRole('dialog', { name: 'Who paid?' })
      await user.click(within(dialog).getByRole('button', { name: /You/ }))

      expect(await screen.findByRole('button', { name: 'Payment method' })).toBeInTheDocument()
    })

    it('saves the expense with no payment method', async () => {
      const { groupId } = await groupWithAccounts()
      renderForm(groupId)
      await describeExpense()
      await user.click(cardOf(await openPicker(), 'Barclays Savings'))
      await payBy('Priya Shah')

      await user.click(saveButton())
      await screen.findByText('Expense added.')

      expect(await savedPaymentMethod()).toBeNull()
    })
  })

  it('counts a chosen account as something entered, so Back asks before leaving', async () => {
    const { groupId } = await groupWithAccounts()
    renderForm(groupId)
    await screen.findByRole('textbox', { name: 'Description' })
    await user.click(cardOf(await openPicker(), 'Barclays Savings'))

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(await screen.findByRole('dialog', { name: 'Discard this expense?' })).toBeInTheDocument()
  })

  it('is read with the accounts\' spend, so the picker\'s cards show it', async () => {
    const { groupId } = await groupWithAccounts()
    renderForm(groupId)
    await screen.findByRole('textbox', { name: 'Description' })
    expect(vi.mocked(getDb)).toHaveBeenCalled()

    const dialog = await openPicker()

    expect(within(cardOf(dialog, 'Forex card')).getByText('₹6,000.00')).toBeInTheDocument()
    expect(within(cardOf(dialog, 'Forex card')).getByText('0%')).toBeInTheDocument()
  })
})
