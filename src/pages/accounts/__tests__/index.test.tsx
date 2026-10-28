// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '../../../routes.ts'
import { accountService } from '../../../services/accountService'
import { useAuthStore } from '../../../stores/useAuthStore'
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

beforeEach(async () => {
  vi.stubGlobal('navigator', { language: 'en-GB', languages: ['en-GB'] })
  await setUpUser()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the Accounts page while it loads', () => {
  it('keeps its header and shows the spinner in a column that fills the page', () => {
    renderAccounts()

    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument()
    const loader = screen.getByRole('status', { name: 'Loading your accounts' })
    expect(loader.closest('[style*="flex-direction: column"]')).not.toBeNull()
  })
})

describe('the Accounts page', () => {
  it('has a Back button to the home page, the heading in the header style, and a tab title', async () => {
    const page = renderAccounts()

    const heading = await screen.findByRole('heading', { name: 'Accounts' })
    expect(heading).toHaveStyle({ fontSize: '32px', fontWeight: '100', lineHeight: '40px', textTransform: 'uppercase' })
    await waitFor(() => expect(document.title).toBe('Accounts · OwnLedger'))

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(page.currentPath()).toBe(ROUTES.home)
  })

  it('is there for a guest too', async () => {
    useAuthStore.setState({ profile: null, guest: true })

    renderAccounts()

    expect(await screen.findByRole('heading', { name: 'Accounts' })).toBeInTheDocument()
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument()
  })

  describe('with no accounts', () => {
    it('shows a picture, what to do, and the Add account button under them', async () => {
      renderAccounts()

      const title = await screen.findByText('No accounts yet')
      expect(screen.getByText('Add a bank account or a credit card.')).toBeInTheDocument()
      const add = screen.getByRole('button', { name: /Add account$/ })
      expect(title.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      // The picture: a bank tile and a credit card tile.
      const picture = title.closest('.ant-empty') as HTMLElement
      expect(picture.querySelector('.tabler-icon-building-bank')).not.toBeNull()
      expect(picture.querySelector('.tabler-icon-credit-card')).not.toBeNull()
      expect(picture.querySelector('.ant-empty-image img, .ant-empty-image svg:not(.tabler-icon)')).toBeNull()
    })

    it('centers the picture in the space the page has', async () => {
      renderAccounts()

      const title = await screen.findByText('No accounts yet')

      const box = (title.closest('.ant-empty') as HTMLElement).parentElement as HTMLElement
      expect(box).toHaveClass('ant-flex-align-center', 'ant-flex-justify-center')
      expect(box.getAttribute('style')).toMatch(/flex: 1/)
    })

    it('has the Add account button in the same round shape as the members page', async () => {
      renderAccounts()

      expect(await screen.findByRole('button', { name: /Add account$/ })).toHaveStyle({ borderRadius: '999px' })
    })
  })

  describe('with accounts', () => {
    it('lists them by name, ignoring case, bank accounts and cards together, with the Add account button last', async () => {
      await addAccount({ kind: 'bank', name: 'savings', currency: 'GBP' })
      await addAccount({ kind: 'card', name: 'HDFC Regalia', currency: 'INR' })
      await addAccount({ kind: 'bank', name: 'Barclays', currency: 'GBP' })

      renderAccounts()

      await screen.findByRole('button', { name: 'Edit Barclays' })
      expect(screen.getAllByRole('button', { name: /^Edit / }).map((entry) => entry.getAttribute('aria-label'))).toEqual([
        'Edit Barclays',
        'Edit HDFC Regalia',
        'Edit savings',
      ])
      expect(screen.queryByText('No accounts yet')).not.toBeInTheDocument()
      const last = screen.getAllByRole('button').at(-1)!
      expect(last).toHaveTextContent('Add account')
    })

    it('shows each card\'s icon, name, and "£ · Bank account" or "₹ · Credit card"', async () => {
      await addAccount({ kind: 'bank', name: 'Barclays', currency: 'GBP' })
      await addAccount({ kind: 'card', name: 'HDFC Regalia', currency: 'INR' })

      renderAccounts()

      const bank = await screen.findByRole('button', { name: 'Edit Barclays' })
      expect(within(bank).getByText('£ · Bank account')).toBeInTheDocument()
      expect(bank.querySelector('.tabler-icon-building-bank')).not.toBeNull()
      const credit = card('HDFC Regalia')
      expect(within(credit).getByText('₹ · Credit card')).toBeInTheDocument()
      expect(credit.querySelector('.tabler-icon-credit-card')).not.toBeNull()
    })

    it('writes a currency with no symbol as its code', async () => {
      await addAccount({ kind: 'bank', name: 'Curaçao account', currency: 'ANG' })

      renderAccounts()

      expect(within(await screen.findByRole('button', { name: 'Edit Curaçao account' })).getByText('ANG · Bank account')).toBeInTheDocument()
    })

    it('has two lines of 20 px beside the 40 px icon', async () => {
      await addAccount({ kind: 'bank', name: 'Barclays', currency: 'GBP' })

      renderAccounts()

      const bank = await screen.findByRole('button', { name: 'Edit Barclays' })
      expect(within(bank).getByText('Barclays')).toHaveStyle({ lineHeight: '20px' })
      expect(within(bank).getByText('£ · Bank account')).toHaveStyle({ lineHeight: '20px' })
    })

    it('has no stats for a bank account', async () => {
      await addAccount({ kind: 'bank', name: 'Barclays', currency: 'GBP' })

      renderAccounts()

      const bank = await screen.findByRole('button', { name: 'Edit Barclays' })
      expect(within(bank).queryByText('Spend target')).not.toBeInTheDocument()
      expect(within(bank).queryByText('Credit limit')).not.toBeInTheDocument()
    })

    it('shows a card\'s spend target and credit limit as two tiles, each with the amount, the spend and a ring', async () => {
      await addAccount({ kind: 'card', name: 'HDFC Regalia', currency: 'GBP', creditLimitMinor: 10_000_000, spendTargetMinor: 60_000, spendTargetPeriod: 'quarter' })

      renderAccounts()

      const credit = await screen.findByRole('button', { name: 'Edit HDFC Regalia' })
      expect(within(credit).getByText('Spend target')).toBeInTheDocument()
      expect(within(credit).getByText('£600.00')).toBeInTheDocument()
      expect(within(credit).getByText('£0.00 spent this quarter')).toBeInTheDocument()
      expect(within(credit).getByText('Credit limit')).toBeInTheDocument()
      expect(within(credit).getByText('£100,000.00')).toBeInTheDocument()
      expect(within(credit).getByText('£0.00 spent this cycle')).toBeInTheDocument()
      expect(within(credit).getAllByRole('progressbar')).toHaveLength(2)
      expect(within(credit).getAllByText('0%')).toHaveLength(2)
    })

    it('shows only the tile it has: a limit with no target, or a target with no limit', async () => {
      await addAccount({ kind: 'card', name: 'Limit only', currency: 'GBP', creditLimitMinor: 500_000 })
      await addAccount({ kind: 'card', name: 'Target only', currency: 'GBP', spendTargetMinor: 20_000, spendTargetPeriod: 'month' })
      await addAccount({ kind: 'card', name: 'Plain', currency: 'GBP' })

      renderAccounts()

      const limitOnly = await screen.findByRole('button', { name: 'Edit Limit only' })
      expect(within(limitOnly).getByText('Credit limit')).toBeInTheDocument()
      expect(within(limitOnly).queryByText('Spend target')).not.toBeInTheDocument()
      expect(within(card('Target only')).getByText('Spend target')).toBeInTheDocument()
      expect(within(card('Target only')).queryByText('Credit limit')).not.toBeInTheDocument()
      expect(within(card('Target only')).getByText('£0.00 spent this month')).toBeInTheDocument()
      expect(within(card('Plain')).queryByRole('progressbar')).not.toBeInTheDocument()
    })

    it('shows what an expense paid with the card spent, as a whole percentage inside the ring', async () => {
      const accountId = await addAccount({ kind: 'card', name: 'HDFC Regalia', currency: 'GBP', creditLimitMinor: 100_000, spendTargetMinor: 3_000, spendTargetPeriod: 'month' })
      const group = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP' })
      if (!group.ok) throw new Error('group')
      const today = new Date()
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const expenseId = await addTestExpense(testDb.db, me.email, group.groupId, { amountMinor: 1_234, date })
      await accountService.setPaymentMethod(testDb.db, await personIdOf(testDb.db, me.email), expenseId, { accountId })

      renderAccounts()

      const credit = await screen.findByRole('button', { name: 'Edit HDFC Regalia' })
      expect(within(credit).getByText('£12.34 spent this month')).toBeInTheDocument()
      expect(within(credit).getByText('£12.34 spent this cycle')).toBeInTheDocument()
      // 12.34 of 30.00 is 41.13%, shown as 41%; 12.34 of 1,000.00 is 1.234%, shown as 1%.
      expect(within(credit).getAllByRole('progressbar').map((ring) => ring.textContent)).toEqual(['41%', '1%'])
    })

    it('says how many expenses it could not count, in another currency with no charged amount', async () => {
      const accountId = await addAccount({ kind: 'card', name: 'HDFC Regalia', currency: 'GBP', spendTargetMinor: 3_000, spendTargetPeriod: 'month' })
      const group = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP' })
      if (!group.ok) throw new Error('group')
      const today = new Date()
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const userId = await personIdOf(testDb.db, me.email)
      for (const description of ['One', 'Two']) {
        const expenseId = await addTestExpense(testDb.db, me.email, group.groupId, { description, currency: 'USD', date })
        await accountService.setPaymentMethod(testDb.db, userId, expenseId, { accountId })
      }

      renderAccounts()

      expect(await screen.findByText('2 expenses in other currencies have no charged amount and are not counted.')).toBeInTheDocument()
    })

    it('says "1 expense" for one', async () => {
      const accountId = await addAccount({ kind: 'card', name: 'HDFC Regalia', currency: 'GBP', spendTargetMinor: 3_000, spendTargetPeriod: 'month' })
      const group = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP' })
      if (!group.ok) throw new Error('group')
      const today = new Date()
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const expenseId = await addTestExpense(testDb.db, me.email, group.groupId, { currency: 'USD', date })
      await accountService.setPaymentMethod(testDb.db, await personIdOf(testDb.db, me.email), expenseId, { accountId })

      renderAccounts()

      expect(await screen.findByText('1 expense in another currency has no charged amount and is not counted.')).toBeInTheDocument()
    })

    it('has cards with the same border as a button and a 20 px radius, from the theme', async () => {
      await addAccount({ kind: 'bank', name: 'Barclays', currency: 'GBP' })

      renderAccounts()

      const bank = await screen.findByRole('button', { name: 'Edit Barclays' })
      expect(bank).toHaveClass('ant-card')
      // Nothing written on the card itself that would take its border or corners away.
      expect(bank.style.borderWidth).toBe('')
    })
  })

  it('shows an error with a way to try again when the accounts cannot be read', async () => {
    vi.spyOn(accountService, 'listAccounts').mockRejectedValueOnce(new Error('disk full'))

    renderAccounts()

    expect(await screen.findByText("Couldn't load your accounts")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument()
  })
})
