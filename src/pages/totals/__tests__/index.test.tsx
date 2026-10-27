// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groups, people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { totalsService } from '../../../services/totalsService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense, addTestSettlement, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { MEMBER_COLORS } from '../../../theme/memberColors.ts'
import { TotalsPage } from '../index.tsx'

// Charts have no size in jsdom unless they are given one; the page's behavior is what is tested here.
vi.mock('recharts', async (importOriginal) => (await import('../../../testing/recharts.tsx')).withFixedSize(await importOriginal()))
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const testDb = setUpTestDatabase()

beforeEach(() => useAuthStore.setState({ profile: me, guest: false, token: null }))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function createGroup(currency = 'GBP') {
  const result = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: currency, memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
  if (!result.ok) throw new Error('group')
  await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
  await testDb.db.update(people).set({ name: 'Sam' }).where(eq(people.email, 'sam@gmail.com'))
  return result.groupId
}

function renderTotals(groupId: string) {
  return renderPage(<TotalsPage />, { path: ROUTES.totals(groupId), pattern: ROUTES.totalsPattern, routes: [ROUTES.group(groupId), ROUTES.home] })
}

const list = (name: string) => screen.getByRole('list', { name })
const rowsOf = (name: string) => within(list(name)).getAllByRole('listitem')

describe('the Totals page while it loads', () => {
  it('shows the spinner with its label', async () => {
    const groupId = await createGroup()
    await addTestExpense(testDb.db, me.email, groupId)
    renderTotals(groupId)

    expect(screen.getByRole('status', { name: 'Loading the totals' })).toBeInTheDocument()
    await screen.findByText('Total spent')
  })
})

describe('the Totals page', () => {
  it('has a quiet heading beside an outlined Back button that goes back to the group, and a tab title', async () => {
    const groupId = await createGroup()
    await addTestExpense(testDb.db, me.email, groupId)
    const page = renderTotals(groupId)

    const heading = await screen.findByRole('heading', { name: 'Totals' })
    expect(heading).toHaveStyle({ fontSize: '32px', fontWeight: '100', lineHeight: '40px', textTransform: 'uppercase' })
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('ant-btn-variant-outlined')
    await waitFor(() => expect(document.title).toBe('Totals · OwnLedger'))

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(page.currentPath()).toBe(ROUTES.group(groupId))
  })

  it('shows the group\'s name under the header', async () => {
    const groupId = await createGroup()
    await addTestExpense(testDb.db, me.email, groupId)
    renderTotals(groupId)

    expect(await screen.findByText('Goa trip')).toBeInTheDocument()
  })

  it('shows the total spent, in large type', async () => {
    const groupId = await createGroup()
    await addTestExpense(testDb.db, me.email, groupId, { amountMinor: 30000 })
    await addTestExpense(testDb.db, me.email, groupId, { amountMinor: 20000 })
    renderTotals(groupId)

    expect(await screen.findByText('Total spent')).toBeInTheDocument()
    expect(screen.getAllByText('£500.00')[0]).toHaveStyle({ fontSize: '32px' })
  })

  it('has a heading for each section: Shares, then Individual contribution', async () => {
    const groupId = await createGroup()
    await addTestExpense(testDb.db, me.email, groupId)
    renderTotals(groupId)

    const headings = (await screen.findAllByRole('heading', { level: 4 })).map((heading) => heading.textContent)

    expect(headings).toEqual(['Shares', 'Individual contribution'])
  })

  it('shows what each member owes and what each paid, with the label and the total in each donut\'s hole', async () => {
    const groupId = await createGroup()
    await addTestExpense(testDb.db, me.email, groupId, { amountMinor: 30000 })
    renderTotals(groupId)

    await screen.findByRole('list', { name: 'Shares' })
    expect(rowsOf('Shares').map((row) => row.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('You£100.00'), expect.stringContaining('Priya£100.00'), expect.stringContaining('Sam£100.00')]))
    expect(rowsOf('Paid').map((row) => row.textContent)).toEqual([expect.stringContaining('You£300.00'), expect.stringContaining('Priya£0.00'), expect.stringContaining('Sam£0.00')])
    // The hole of each donut: its label and the total.
    expect(screen.getAllByText('£300.00').length).toBeGreaterThanOrEqual(3)
    expect(screen.getAllByText('Shares').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Paid').length).toBeGreaterThanOrEqual(1)
  })

  it('lists the largest first in each list on its own', async () => {
    const groupId = await createGroup()
    const priyaId = await personIdOf(testDb.db, 'priya@gmail.com')
    const omkarId = await personIdOf(testDb.db, me.email)
    await addTestExpense(testDb.db, me.email, groupId, {
      amountMinor: 900,
      paidBy: priyaId,
      split: { method: 'exact', values: { [omkarId]: 600, [priyaId]: 300, [await personIdOf(testDb.db, 'sam@gmail.com')]: 0 } },
    })
    renderTotals(groupId)

    await screen.findByRole('list', { name: 'Shares' })
    expect(rowsOf('Shares').map((row) => within(row).getByText(/^(You|Priya|Sam)$/).textContent)).toEqual(['You', 'Priya', 'Sam'])
    expect(rowsOf('Paid').map((row) => within(row).getByText(/^(You|Priya|Sam)$/).textContent)).toEqual(['Priya', 'You', 'Sam'])
  })

  it('gives a member the same color in both lists', async () => {
    const groupId = await createGroup()
    const priyaId = await personIdOf(testDb.db, 'priya@gmail.com')
    await addTestExpense(testDb.db, me.email, groupId, { amountMinor: 900, paidBy: priyaId })
    renderTotals(groupId)

    await screen.findByRole('list', { name: 'Shares' })
    const colorOf = (listName: string, who: string) => {
      const row = rowsOf(listName).find((one) => within(one).queryByText(who))!
      return (row.querySelector('span[aria-hidden]') as HTMLElement).style.background
    }
    for (const who of ['You', 'Priya', 'Sam']) expect(colorOf('Paid', who)).toBe(colorOf('Shares', who))
    // The user has the first color of the palette.
    expect(colorOf('Shares', 'You')).toBe('rgb(13, 148, 136)')
    expect(MEMBER_COLORS[0]).toBe('#0d9488')
  })

  it('draws a slice for each member with an amount, in both donuts', async () => {
    const groupId = await createGroup()
    const priyaId = await personIdOf(testDb.db, 'priya@gmail.com')
    await addTestExpense(testDb.db, me.email, groupId, { amountMinor: 900, paidBy: priyaId })
    const { container } = renderTotals(groupId)

    // Shares: all three owe a third. Paid: only Priya paid.
    await waitFor(() => expect(container.querySelectorAll('.recharts-sector')).toHaveLength(4))
  })

  it('leaves out payments between members, and writes no currency dropdown for one currency', async () => {
    const groupId = await createGroup()
    await addTestExpense(testDb.db, me.email, groupId, { amountMinor: 30000 })
    await addTestSettlement(testDb.db, 'priya@gmail.com', me.email, groupId, { amountMinor: 70000 })
    renderTotals(groupId)

    await screen.findByText('Total spent')
    expect(screen.getAllByText('£300.00').length).toBeGreaterThan(0)
    expect(screen.queryByText('£1,000.00')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Currency' })).not.toBeInTheDocument()
  })
})

describe('the currency dropdown', () => {
  async function setUpTwoCurrencies() {
    const groupId = await createGroup('GBP')
    await addTestExpense(testDb.db, me.email, groupId, { amountMinor: 20000, currency: 'GBP' })
    await addTestExpense(testDb.db, me.email, groupId, { amountMinor: 50000, currency: 'USD' })
    return groupId
  }

  it('appears when the group has expenses in more than one currency, with the group\'s default chosen', async () => {
    renderTotals(await setUpTwoCurrencies())

    const select = await screen.findByRole('combobox', { name: 'Currency' })
    expect(select.closest('.ant-select')).toHaveTextContent('GBP')
    expect(screen.getAllByText('£200.00').length).toBeGreaterThan(0)
  })

  it('lists the currencies that have expenses, the default first', async () => {
    renderTotals(await setUpTwoCurrencies())

    await userEvent.click(await screen.findByRole('combobox', { name: 'Currency' }))

    const options = [...document.querySelectorAll('.ant-select-item-option-content')].map((option) => option.textContent)
    expect(options).toEqual([expect.stringContaining('GBP'), expect.stringContaining('USD')])
  })

  it('shows the other currency\'s total and lists when it is chosen, and never adds the two', async () => {
    renderTotals(await setUpTwoCurrencies())

    await userEvent.click(await screen.findByRole('combobox', { name: 'Currency' }))
    await userEvent.click(await screen.findByText(/USD/, { selector: '.ant-select-item-option-content' }))

    await waitFor(() => expect(screen.getAllByText(/\$500\.00/).length).toBeGreaterThan(0))
    expect(screen.queryByText('£200.00')).not.toBeInTheDocument()
    expect(rowsOf('Paid')[0]).toHaveTextContent('You$500.00')
  })

  it('starts with the first currency A to Z when the default has no expenses', async () => {
    const groupId = await createGroup('GBP')
    await addTestExpense(testDb.db, me.email, groupId, { currency: 'USD', amountMinor: 1000 })
    await addTestExpense(testDb.db, me.email, groupId, { currency: 'EUR', amountMinor: 2000 })
    renderTotals(groupId)

    const select = await screen.findByRole('combobox', { name: 'Currency' })
    expect(select.closest('.ant-select')).toHaveTextContent('EUR')
  })
})

describe('the Totals page in its other states', () => {
  it('says there are no expenses when opened by its address for a group with none', async () => {
    const groupId = await createGroup()
    renderTotals(groupId)

    expect(await screen.findByText('No expenses yet')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument()
  })

  it('shows "Group not found" for a group that does not exist, was deleted or is not the user\'s', async () => {
    const groupId = await createGroup()
    await testDb.db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, groupId))
    renderTotals(groupId)

    expect(await screen.findByText('Group not found')).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Group not found · OwnLedger'))
  })

  it('says it could not load, with Try again and a Back button, and reads again', async () => {
    const groupId = await createGroup()
    await addTestExpense(testDb.db, me.email, groupId)
    const real = totalsService.groupTotals
    vi.spyOn(totalsService, 'groupTotals').mockRejectedValueOnce(new Error('disk')).mockImplementation(real)
    const page = renderTotals(groupId)

    expect(await screen.findByText("Couldn't load the totals")).toBeInTheDocument()
    expect(screen.getByText('disk')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Total spent')).toBeInTheDocument()
    expect(page.currentPath()).toBe(ROUTES.totals(groupId))
  })
})
