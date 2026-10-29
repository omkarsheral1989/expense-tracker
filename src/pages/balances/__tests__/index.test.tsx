// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { balancesService } from '../../../services/balancesService'
import { moneyService } from '../../../services/moneyService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { OWED_TO_YOU_COLOR, YOU_OWE_COLOR } from '../../../theme/balanceColors.ts'
import { BalancesPage } from '../index.tsx'

vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const testDb = setUpTestDatabase()
const gbp = (minor: number) => moneyService.format(minor, 'GBP')

beforeEach(() => useAuthStore.setState({ profile: me, guest: false, token: null }))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Omkar, Priya, Sam and Rima. Omkar paid 10.00 for Sam and Priya paid 2.00 for Omkar: Omkar gets back 8.00, Priya 2.00, Sam owes 10.00, Rima is settled. */
async function createGroup() {
  const result = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com', 'sam@gmail.com', 'rima@gmail.com'] })
  if (!result.ok) throw new Error('group')
  await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
  await testDb.db.update(people).set({ name: 'Sam' }).where(eq(people.email, 'sam@gmail.com'))
  await testDb.db.update(people).set({ name: 'Rima' }).where(eq(people.email, 'rima@gmail.com'))
  const omkarId = await personIdOf(testDb.db, me.email)
  const priyaId = await personIdOf(testDb.db, 'priya@gmail.com')
  const samId = await personIdOf(testDb.db, 'sam@gmail.com')
  await addTestExpense(testDb.db, me.email, result.groupId, { amountMinor: 1000, split: { method: 'exact', values: { [samId]: 1000 } } })
  await addTestExpense(testDb.db, 'priya@gmail.com', result.groupId, { amountMinor: 200, paidBy: priyaId, split: { method: 'exact', values: { [omkarId]: 200 } } })
  return result.groupId
}

function renderBalances(groupId: string, state?: unknown) {
  function Settle() {
    return <p>Settle: {JSON.stringify(useLocation().state)}</p>
  }
  return renderPage(<BalancesPage />, {
    path: ROUTES.balances(groupId),
    pattern: ROUTES.balancesPattern,
    routes: [ROUTES.group(groupId), ROUTES.home],
    extra: [{ path: ROUTES.settleUp(groupId), element: <Settle /> }],
    state,
  })
}

/** The button that opens the row whose sentence starts with `start` (a line under an open row can start the same way). */
const rowButton = (start: string) =>
  [...document.querySelectorAll<HTMLElement>('button[aria-expanded]')].find((button) => button.querySelector('.ant-typography')?.textContent?.startsWith(start)) as HTMLElement
/** The line of an open row with this whole text (its amount is a bold piece of its own, so the text is split). */
const lineWith = (container: HTMLElement, text: string) =>
  within(container).getByText((_, element) => element?.classList.contains('ant-typography') === true && element.textContent === text)
const cardOf = (button: HTMLElement) => button.closest('.ant-card') as HTMLElement

describe('the Balances page while it loads', () => {
  it('shows the spinner with its label', async () => {
    renderBalances(await createGroup())

    expect(screen.getByRole('status', { name: 'Loading the balances' })).toBeInTheDocument()
    await screen.findByRole('heading', { name: 'Balances' })
  })
})

describe('the Balances page', () => {
  it('has a quiet heading beside an outlined Back button that goes back to the group, and a tab title', async () => {
    const groupId = await createGroup()
    const page = renderBalances(groupId)

    const heading = await screen.findByRole('heading', { name: 'Balances' })
    expect(heading).toHaveStyle({ fontSize: '32px', fontWeight: '100', lineHeight: '40px', textTransform: 'uppercase' })
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('ant-btn-variant-outlined')
    expect(document.title).toBe('Balances · OwnLedger')

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(groupId)))
  })

  it('has a row for every member, the user first and the others A to Z, with what each gets back or owes in total', async () => {
    renderBalances(await createGroup())

    await screen.findByRole('heading', { name: 'Balances' })
    const sentences = [...document.querySelectorAll('.ant-card-body')].map((body) => body.querySelector('.ant-typography')?.textContent)
    expect(sentences).toEqual([
      `You get back ${gbp(800)} in total`,
      `Priya gets back ${gbp(200)} in total`,
      'Rima is settled up',
      `Sam owes ${gbp(1000)} in total`,
    ])
  })

  it('colors only the amounts: green for what is owed to someone, orange-red for what they owe', async () => {
    renderBalances(await createGroup())

    await screen.findByRole('heading', { name: 'Balances' })
    const amount = (card: HTMLElement) => card.querySelector('strong') as HTMLElement
    const [youCard, , , samCard] = [...document.querySelectorAll<HTMLElement>('.ant-card')]
    expect(amount(youCard)).toHaveStyle({ color: OWED_TO_YOU_COLOR.light })
    expect(amount(samCard)).toHaveStyle({ color: YOU_OWE_COLOR.light })
    // The sentence itself keeps the normal text color.
    const sentence = youCard.querySelector('.ant-typography') as HTMLElement
    expect(sentence.style.color).toBe('')
    expect(sentence.querySelectorAll('strong')).toHaveLength(1)
  })

  it('draws each row on a 30 px card, with a sentence on 20 px lines so two lines fit the 40 px avatar', async () => {
    renderBalances(await createGroup())

    await screen.findByRole('heading', { name: 'Balances' })
    for (const card of document.querySelectorAll<HTMLElement>('.ant-card')) expect(card).toHaveStyle({ borderRadius: '30px' })
    expect(document.querySelector('.ant-card .ant-typography')).toHaveStyle({ lineHeight: '20px' })
  })

  it('joins several currencies in one row, with commas between amounts of one kind', async () => {
    const groupId = await createGroup()
    await addTestExpense(testDb.db, me.email, groupId, { amountMinor: 3000, currency: 'USD' })
    renderBalances(groupId)

    await screen.findByRole('heading', { name: 'Balances' })
    const sentence = document.querySelector('.ant-card-body .ant-typography')?.textContent
    expect(sentence).toBe(`You get back ${gbp(800)}, ${moneyService.format(2250, 'USD')} in total`)
  })

  it('keeps a settled-up member\'s row plain: grey, with no chevron and nothing to open', async () => {
    renderBalances(await createGroup())

    await screen.findByRole('heading', { name: 'Balances' })
    const rima = screen.getByText('Rima is settled up')
    expect(rima.closest('button')).toBeNull()
    expect(rima.closest('.ant-card')?.querySelector('.balance-chevron')).toBeNull()
    expect(rima).toHaveClass('ant-typography-secondary')
  })
})

describe('opening a row', () => {
  it('starts shut, with an 18 px chevron pointing right and its payments out of reach', async () => {
    renderBalances(await createGroup())

    await screen.findByRole('heading', { name: 'Balances' })
    const button = rowButton('You get back')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    const chevron = button.querySelector('.balance-chevron') as SVGElement
    expect(chevron).toHaveAttribute('width', '18')
    expect(chevron).toHaveStyle({ transform: 'rotate(-90deg)' })
    expect(cardOf(button).querySelector('.balance-lines')).toHaveAttribute('data-open', 'false')
    expect(cardOf(button).querySelector('.balance-lines > div')).toHaveAttribute('inert')
  })

  it('opens to one line per payment from the person\'s point of view, and the chevron turns down', async () => {
    renderBalances(await createGroup())
    await screen.findByRole('heading', { name: 'Balances' })

    await userEvent.click(rowButton('You get back'))

    const button = rowButton('You get back')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button.querySelector('.balance-chevron')).toHaveStyle({ transform: 'none' })
    const lines = cardOf(button).querySelector('.balance-lines') as HTMLElement
    expect(lines).toHaveAttribute('data-open', 'true')
    expect(lines.firstElementChild).not.toHaveAttribute('inert')
    expect(lineWith(lines, `You get back ${gbp(800)} from Sam`)).toBeInTheDocument()
    // Sam's 2.00 goes to Priya, so it is not one of the user's payments.
    expect(within(lines).queryByText(/Priya/)).toBeNull()
  })

  it('shows what a debtor owes to each person it goes to', async () => {
    renderBalances(await createGroup())
    await screen.findByRole('heading', { name: 'Balances' })

    await userEvent.click(rowButton('Sam owes'))

    const lines = cardOf(rowButton('Sam owes')).querySelector('.balance-lines') as HTMLElement
    expect(lineWith(lines, `Sam owes ${gbp(800)} to you`)).toBeInTheDocument()
    expect(lineWith(lines, `Sam owes ${gbp(200)} to Priya`)).toBeInTheDocument()
  })

  it('shuts again on a second press, and rows open on their own', async () => {
    renderBalances(await createGroup())
    await screen.findByRole('heading', { name: 'Balances' })

    await userEvent.click(rowButton('You get back'))
    await userEvent.click(rowButton('Sam owes'))
    expect(rowButton('You get back')).toHaveAttribute('aria-expanded', 'true')
    expect(rowButton('Sam owes')).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(rowButton('You get back'))
    expect(rowButton('You get back')).toHaveAttribute('aria-expanded', 'false')
    expect(rowButton('Sam owes')).toHaveAttribute('aria-expanded', 'true')
  })

  it('colors only the amount of each line, green when the person gets it back and orange-red when they owe it', async () => {
    renderBalances(await createGroup())
    await screen.findByRole('heading', { name: 'Balances' })

    await userEvent.click(rowButton('You get back'))
    await userEvent.click(rowButton('Sam owes'))

    const amountIn = (button: HTMLElement) => {
      const line = cardOf(button).querySelector('.balance-lines .ant-typography') as HTMLElement
      expect(line.querySelectorAll('strong')).toHaveLength(1)
      expect(line.style.color).toBe('')
      return line.querySelector('strong') as HTMLElement
    }
    expect(amountIn(rowButton('You get back'))).toHaveStyle({ color: OWED_TO_YOU_COLOR.light })
    expect(amountIn(rowButton('Sam owes'))).toHaveStyle({ color: YOU_OWE_COLOR.light })
    expect(amountIn(rowButton('Sam owes')).textContent).toBe(gbp(800))
  })

  it('indents the lines to start under the sentence, not under the avatar, and gives each a pill-shaped Settle up button', async () => {
    renderBalances(await createGroup())
    await screen.findByRole('heading', { name: 'Balances' })

    await userEvent.click(rowButton('You get back'))

    const lines = cardOf(rowButton('You get back')).querySelector('.balance-lines') as HTMLElement
    // The avatar's 40 px and the 12 px gap beside it.
    expect(lines.querySelector('.ant-flex-vertical')).toHaveStyle({ paddingLeft: '52px' })
    expect(within(lines).getByRole('button', { name: 'Settle up' })).toHaveStyle({ borderRadius: '999px' })
  })
})

describe('the Settle up button of a line', () => {
  it('opens Settle up with the payment filled in: the debtor pays the creditor', async () => {
    const groupId = await createGroup()
    const page = renderBalances(groupId)
    await screen.findByRole('heading', { name: 'Balances' })
    await userEvent.click(rowButton('You get back'))

    await userEvent.click(within(cardOf(rowButton('You get back'))).getByRole('button', { name: 'Settle up' }))

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.settleUp(groupId)))
    const samId = await personIdOf(testDb.db, 'sam@gmail.com')
    const omkarId = await personIdOf(testDb.db, me.email)
    expect(await screen.findByText(`Settle: ${JSON.stringify({ settle: { payerId: samId, recipientId: omkarId, amountMinor: 800, currency: 'GBP' } })}`)).toBeInTheDocument()
  })

  it('works for a payment between two other members, too', async () => {
    const groupId = await createGroup()
    renderBalances(groupId)
    await screen.findByRole('heading', { name: 'Balances' })
    await userEvent.click(rowButton('Priya gets back'))

    await userEvent.click(within(cardOf(rowButton('Priya gets back'))).getByRole('button', { name: 'Settle up' }))

    const samId = await personIdOf(testDb.db, 'sam@gmail.com')
    const priyaId = await personIdOf(testDb.db, 'priya@gmail.com')
    expect(await screen.findByText(`Settle: ${JSON.stringify({ settle: { payerId: samId, recipientId: priyaId, amountMinor: 200, currency: 'GBP' } })}`)).toBeInTheDocument()
  })
})

describe('the Balances page when it cannot show balances', () => {
  it('says "Group not found" for a group that does not exist', async () => {
    renderBalances('3f2a9c1e-0000-4000-8000-0000000000ff')

    expect(await screen.findByText('Group not found')).toBeInTheDocument()
    expect(document.title).toBe('Group not found · OwnLedger')
  })

  it('offers Try again, and a Back arrow, when it cannot read the balances', async () => {
    const groupId = await createGroup()
    const read = vi.spyOn(balancesService, 'groupBalances').mockRejectedValueOnce(new Error('disk gone'))
    renderBalances(groupId)

    expect(await screen.findByText("Couldn't load the balances")).toBeInTheDocument()
    expect(screen.getByText('disk gone')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Balances' })).toBeInTheDocument()
    expect(read).toHaveBeenCalledTimes(2)
  })
})
