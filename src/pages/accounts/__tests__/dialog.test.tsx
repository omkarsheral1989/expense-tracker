// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { accounts } from '../../../db/schema.ts'
import { accountService } from '../../../services/accountService'
import { addTestExpense, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { card, me, renderAccounts, setUpAccountsTests } from './helpers.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const { testDb, setUpUser, addAccount } = setUpAccountsTests()

let user: ReturnType<typeof userEvent.setup>

beforeEach(async () => {
  vi.stubGlobal('navigator', { language: 'en-GB', languages: ['en-GB'] })
  user = userEvent.setup()
  await setUpUser()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Opens the page and its Add account dialog. */
async function openAdd() {
  renderAccounts()
  await user.click(await screen.findByRole('button', { name: /Add account$/ }))
  return screen.findByRole('dialog', { name: 'Add account' })
}

async function openEdit(name: string) {
  renderAccounts()
  await user.click(await screen.findByRole('button', { name: `Edit ${name}` }))
  return screen.findByRole('dialog', { name: 'Edit account' })
}

/** A type tile's radio: its name is the picture's and the text's, so it is matched by the words. */
const kind = (dialog: HTMLElement, name: 'Bank account' | 'Credit card') => within(dialog).getByRole('radio', { name: new RegExp(name) })
const nameField = (dialog: HTMLElement) => within(dialog).getByRole('textbox', { name: 'Name' })
const fieldOf = (input: HTMLElement) => input.closest('.ant-form-item') as HTMLElement
const cardFields = (dialog: HTMLElement) => dialog.querySelector('.account-card-fields') as HTMLElement
const rows = () => testDb.db.select().from(accounts)

describe('the Add account dialog', () => {
  it('starts with a bank account chosen, a name and a currency (the device\'s region)', async () => {
    const dialog = await openAdd()

    expect(kind(dialog, 'Bank account')).toBeChecked()
    expect(kind(dialog, 'Credit card')).not.toBeChecked()
    expect(nameField(dialog)).toHaveValue('')
    expect(nameField(dialog)).toHaveAttribute('placeholder', 'For example, HDFC Regalia')
    expect(within(dialog).getByText('GBP – British Pound (£)')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Add' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('shows the type as two tiles, the chosen one with a border and the other with a transparent one', async () => {
    const dialog = await openAdd()

    expect(dialog.querySelector('.account-kind-selector')).not.toBeNull()
    const tiles = dialog.querySelectorAll('.account-kind-selector .ant-segmented-item')
    expect(tiles).toHaveLength(2)
    expect(within(tiles[0] as HTMLElement).getByRole('img', { name: 'Bank account' })).toBeInTheDocument()
    expect(within(tiles[1] as HTMLElement).getByRole('img', { name: 'Credit card' })).toBeInTheDocument()
    expect(tiles[0]).toHaveClass('ant-segmented-item-selected')
  })

  it('draws the icons of the two type tiles at 24 px', async () => {
    const dialog = await openAdd()

    expect(within(dialog).getByRole('img', { name: 'Bank account' })).toHaveStyle({ width: '40px', fontSize: '24px' })
    expect(within(dialog).getByRole('img', { name: 'Credit card' })).toHaveStyle({ width: '40px', fontSize: '24px' })
  })

  it('keeps the card options folded away, and out of reach, for a bank account', async () => {
    const dialog = await openAdd()

    expect(cardFields(dialog)).toHaveAttribute('data-open', 'false')
    expect(cardFields(dialog)).toHaveAttribute('inert')
  })

  it('opens the card options when Credit card is chosen, and folds them away again for Bank account', async () => {
    const dialog = await openAdd()

    await user.click(kind(dialog, 'Credit card'))
    expect(cardFields(dialog)).toHaveAttribute('data-open', 'true')
    expect(cardFields(dialog)).not.toHaveAttribute('inert')
    for (const label of ['Statement day', 'Credit limit', 'Spend target']) expect(within(dialog).getByText(label)).toBeInTheDocument()

    await user.click(kind(dialog, 'Bank account'))
    expect(cardFields(dialog)).toHaveAttribute('data-open', 'false')
  })

  it('asks a phone for the digits keyboard for the statement day', async () => {
    const dialog = await openAdd()

    expect(within(dialog).getByRole('spinbutton', { name: 'Statement day' })).toHaveAttribute('inputmode', 'numeric')
  })

  it('has the spend target period before the amount, per month to start, and both amounts left-aligned', async () => {
    const dialog = await openAdd()
    await user.click(kind(dialog, 'Credit card'))

    const period = within(dialog).getByRole('combobox', { name: 'Spend target period' })
    const target = within(dialog).getByRole('textbox', { name: 'Spend target' })
    expect(period.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(dialog).getByText('per month')).toBeInTheDocument()
    expect(target).toHaveStyle({ textAlign: 'start' })
    expect(within(dialog).getByRole('textbox', { name: 'Credit limit' })).toHaveStyle({ textAlign: 'start' })
  })

  it('saves a bank account with its name and currency, closes, and lists it', async () => {
    const dialog = await openAdd()

    await user.type(nameField(dialog), '  Barclays   Savings ')
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add account' })).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: 'Edit Barclays Savings' })).toBeInTheDocument()
    expect(await rows()).toEqual([expect.objectContaining({ kind: 'bank', name: 'Barclays Savings', currency: 'GBP', updatedBy: await personIdOf(testDb.db, me.email) })])
  })

  it('saves a credit card with every option, amounts in minor units', async () => {
    const dialog = await openAdd()
    await user.click(kind(dialog, 'Credit card'))

    await user.type(nameField(dialog), 'HDFC Regalia')
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Statement day' }), '15')
    await user.type(within(dialog).getByRole('textbox', { name: 'Credit limit' }), '100000')
    await user.type(within(dialog).getByRole('textbox', { name: 'Spend target' }), '600.5')
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add account' })).not.toBeInTheDocument())
    expect(await rows()).toEqual([
      expect.objectContaining({ kind: 'card', name: 'HDFC Regalia', statementDay: 15, creditLimitMinor: 10_000_000, spendTargetMinor: 60_050, spendTargetPeriod: 'month' }),
    ])
  })

  it('saves a quarterly target when the period is changed', async () => {
    const dialog = await openAdd()
    await user.click(kind(dialog, 'Credit card'))
    await user.type(nameField(dialog), 'HDFC Regalia')
    await user.type(within(dialog).getByRole('textbox', { name: 'Spend target' }), '600')

    fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: 'Spend target period' }))
    await user.click(await screen.findByTitle('per quarter'))
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add account' })).not.toBeInTheDocument())
    expect((await rows())[0]).toMatchObject({ spendTargetMinor: 60_000, spendTargetPeriod: 'quarter' })
  })

  it('saves a credit card with just a name and a currency, and none of the options', async () => {
    const dialog = await openAdd()
    await user.click(kind(dialog, 'Credit card'))
    await user.type(nameField(dialog), 'Plain card')

    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add account' })).not.toBeInTheDocument())
    expect((await rows())[0]).toMatchObject({ statementDay: null, creditLimitMinor: null, spendTargetMinor: null, spendTargetPeriod: null })
  })

  it('saves a bank account even when card options were typed and then folded away', async () => {
    const dialog = await openAdd()
    await user.click(kind(dialog, 'Credit card'))
    // A limit of 0 is refused for a card, but this one is for a card the user then changes their mind about.
    await user.type(within(dialog).getByRole('textbox', { name: 'Credit limit' }), '0')
    await user.type(within(dialog).getByRole('textbox', { name: 'Spend target' }), '600')
    await user.click(kind(dialog, 'Bank account'))
    await user.type(nameField(dialog), 'Savings')

    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add account' })).not.toBeInTheDocument())
    expect((await rows())[0]).toMatchObject({ kind: 'bank', name: 'Savings', statementDay: null, spendTargetMinor: null })
  })

  it('closes with Cancel and saves nothing', async () => {
    const dialog = await openAdd()
    await user.type(nameField(dialog), 'Savings')

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add account' })).not.toBeInTheDocument())
    expect(await rows()).toEqual([])
  })

  it('starts empty each time it opens', async () => {
    const first = await openAdd()
    await user.type(nameField(first), 'Typed once')
    await user.click(within(first).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add account' })).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Add account$/ }))

    expect(nameField(await screen.findByRole('dialog', { name: 'Add account' }))).toHaveValue('')
  })

  describe('checks when Add is pressed', () => {
    it('shows every problem at once, each beside its field', async () => {
      const dialog = await openAdd()
      await user.click(kind(dialog, 'Credit card'))
      await user.type(within(dialog).getByRole('textbox', { name: 'Credit limit' }), '0')

      await user.click(within(dialog).getByRole('button', { name: 'Add' }))

      expect(await within(fieldOf(nameField(dialog))).findByText('Enter a name.')).toBeInTheDocument()
      expect(within(fieldOf(within(dialog).getByRole('textbox', { name: 'Credit limit' }))).getByText('Enter an amount more than 0.')).toBeInTheDocument()
      expect(dialog).toBeInTheDocument()
      expect(await rows()).toEqual([])
    })

    it('makes a message go as soon as its field is edited', async () => {
      const dialog = await openAdd()
      await user.click(within(dialog).getByRole('button', { name: 'Add' }))
      await within(fieldOf(nameField(dialog))).findByText('Enter a name.')

      await user.type(nameField(dialog), 'S')

      await waitFor(() => expect(within(fieldOf(nameField(dialog))).queryByText('Enter a name.')).not.toBeInTheDocument())
    })

    it('says which account already has the name, ignoring case and extra spaces', async () => {
      await addAccount({ kind: 'bank', name: 'Barclays Savings', currency: 'GBP' })
      const dialog = await openAdd()

      await user.type(nameField(dialog), 'barclays   SAVINGS')
      await user.click(within(dialog).getByRole('button', { name: 'Add' }))

      expect(await within(fieldOf(nameField(dialog))).findByText('You already have an account called Barclays Savings.')).toBeInTheDocument()
      expect(await rows()).toHaveLength(1)
    })

    it('refuses a spend target of 0 and one with more digits than the largest amount', async () => {
      const dialog = await openAdd()
      await user.click(kind(dialog, 'Credit card'))
      await user.type(nameField(dialog), 'Card')
      await user.type(within(dialog).getByRole('textbox', { name: 'Spend target' }), '0')

      await user.click(within(dialog).getByRole('button', { name: 'Add' }))

      expect(await within(fieldOf(within(dialog).getByRole('textbox', { name: 'Spend target' }))).findByText('Enter an amount more than 0.')).toBeInTheDocument()

      await user.clear(within(dialog).getByRole('textbox', { name: 'Spend target' }))
      await user.type(within(dialog).getByRole('textbox', { name: 'Spend target' }), '2000000000')
      await user.click(within(dialog).getByRole('button', { name: 'Add' }))
      expect(await within(fieldOf(within(dialog).getByRole('textbox', { name: 'Spend target' }))).findByText('That amount is too large.')).toBeInTheDocument()
    })
  })

  it('says so, and stays open with what was typed, when saving fails', async () => {
    vi.spyOn(accountService, 'createAccount').mockRejectedValue(new Error('disk full'))
    const dialog = await openAdd()
    await user.type(nameField(dialog), 'Savings')

    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    expect(await screen.findByText("Couldn't save the account. Please try again.")).toBeInTheDocument()
    expect(nameField(dialog)).toHaveValue('Savings')
  })

  it('is on the page background, like the pages behind it, in a sheet that is not white', async () => {
    const dialog = await openAdd()

    expect(dialog.className).toContain('ant-drawer-section')
  })
})

describe('the Edit account dialog', () => {
  it('opens filled in with what the account has, the type fixed, and the title "Edit account"', async () => {
    await addAccount({ kind: 'card', name: 'HDFC Regalia', currency: 'GBP', statementDay: 15, creditLimitMinor: 10_000_000, spendTargetMinor: 60_050, spendTargetPeriod: 'quarter' })

    const dialog = await openEdit('HDFC Regalia')

    expect(nameField(dialog)).toHaveValue('HDFC Regalia')
    expect(kind(dialog, 'Credit card')).toBeChecked()
    expect(kind(dialog, 'Bank account')).toBeDisabled()
    expect(kind(dialog, 'Credit card')).toBeDisabled()
    expect(within(dialog).getByRole('spinbutton', { name: 'Statement day' })).toHaveValue('15')
    expect(within(dialog).getByRole('textbox', { name: 'Credit limit' })).toHaveValue('100,000.00')
    expect(within(dialog).getByRole('textbox', { name: 'Spend target' })).toHaveValue('600.50')
    expect(within(dialog).getByText('per quarter')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(cardFields(dialog)).toHaveAttribute('data-open', 'true')
  })

  it('opens a bank account with the card options folded away', async () => {
    await addAccount({ kind: 'bank', name: 'Savings', currency: 'GBP' })

    const dialog = await openEdit('Savings')

    expect(cardFields(dialog)).toHaveAttribute('data-open', 'false')
  })

  it('saves a new name, closes, and shows it on the list', async () => {
    await addAccount({ kind: 'bank', name: 'Savings', currency: 'GBP' })
    const dialog = await openEdit('Savings')

    await user.clear(nameField(dialog))
    await user.type(nameField(dialog), 'Rainy day')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit account' })).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: 'Edit Rainy day' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Savings' })).not.toBeInTheDocument()
  })

  it('changes a card\'s options, and the card on the page follows', async () => {
    await addAccount({ kind: 'card', name: 'HDFC Regalia', currency: 'GBP', spendTargetMinor: 60_000, spendTargetPeriod: 'month' })
    const dialog = await openEdit('HDFC Regalia')

    await user.clear(within(dialog).getByRole('textbox', { name: 'Spend target' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'Spend target' }), '900')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit account' })).not.toBeInTheDocument())
    expect(await within(card('HDFC Regalia')).findByText('£900.00')).toBeInTheDocument()
  })

  it('just closes when nothing was changed', async () => {
    await addAccount({ kind: 'bank', name: 'Savings', currency: 'GBP' })
    const [before] = await rows()
    const dialog = await openEdit('Savings')

    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit account' })).not.toBeInTheDocument())
    expect((await rows())[0].updatedAt).toEqual(before.updatedAt)
  })

  it('keeps the currency free to change while no expense uses the account', async () => {
    await addAccount({ kind: 'bank', name: 'Savings', currency: 'GBP' })

    const dialog = await openEdit('Savings')

    expect(within(dialog).getByRole('combobox', { name: 'Currency' })).not.toBeDisabled()
    expect(within(dialog).getByText('The currency the account is debited in.')).toBeInTheDocument()
  })

  it('switches the currency off, saying why, once an expense uses the account', async () => {
    const accountId = await addAccount({ kind: 'bank', name: 'Savings', currency: 'GBP' })
    const group = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP' })
    if (!group.ok) throw new Error('group')
    const expenseId = await addTestExpense(testDb.db, me.email, group.groupId)
    await accountService.setPaymentMethod(testDb.db, await personIdOf(testDb.db, me.email), expenseId, { accountId })

    const dialog = await openEdit('Savings')

    expect(within(dialog).getByRole('combobox', { name: 'Currency' })).toBeDisabled()
    expect(within(dialog).getByText('Expenses use this account, so its currency cannot change.')).toBeInTheDocument()
  })

  it('names the account that already has the name it is changed to', async () => {
    await addAccount({ kind: 'bank', name: 'Savings', currency: 'GBP' })
    await addAccount({ kind: 'bank', name: 'Current', currency: 'GBP' })
    const dialog = await openEdit('Savings')

    await user.clear(nameField(dialog))
    await user.type(nameField(dialog), 'current')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(fieldOf(nameField(dialog))).findByText('You already have an account called Current.')).toBeInTheDocument()
  })

  it('says so, closes, and reads the list again when the account is gone', async () => {
    const accountId = await addAccount({ kind: 'bank', name: 'Savings', currency: 'GBP' })
    const dialog = await openEdit('Savings')
    await testDb.db.update(accounts).set({ deletedAt: new Date() }).where(eq(accounts.id, accountId))

    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await user.type(nameField(dialog), 'x').catch(() => undefined)

    expect(await screen.findByText('This account is no longer available.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit account' })).not.toBeInTheDocument())
  })

  it('opens afresh for each account, not with what was typed in the one before', async () => {
    await addAccount({ kind: 'bank', name: 'Alpha', currency: 'GBP' })
    await addAccount({ kind: 'bank', name: 'Beta', currency: 'GBP' })
    const first = await openEdit('Alpha')
    await user.type(nameField(first), ' changed')
    await user.click(within(first).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit account' })).not.toBeInTheDocument())

    await user.click(card('Beta'))

    expect(nameField(await screen.findByRole('dialog', { name: 'Edit account' }))).toHaveValue('Beta')
  })
})
