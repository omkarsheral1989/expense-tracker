// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { ROUTES } from '../../../../../../routes.ts'
import type { ExpenseListItem } from '../../../../../../services/expenseService/types.ts'
import { renderPage } from '../../../../../../testing/render.tsx'
import { ExpenseRow } from '../index.tsx'

afterEach(cleanup)

const GROUP = '3f2a9c1e-0000-4000-8000-000000000001'
const EXPENSE = '3f2a9c1e-0000-4000-8000-000000000002'
const you = { personId: 'u', email: 'omkar@gmail.com', name: 'Omkar', isYou: true }
const priya = { personId: 'p', email: 'priya@gmail.com', name: 'Priya Shah', isYou: false }

const item: ExpenseListItem = {
  id: EXPENSE,
  description: 'Beach shack dinner',
  category: 'food.dining_out',
  amountMinor: 900,
  currency: 'GBP',
  date: '2026-10-05',
  payer: you,
  yourPaidMinor: 900,
  yourOwedMinor: 450,
  involved: true,
}

function StateProbe() {
  return <pre data-testid="state">{JSON.stringify(useLocation().state)}</pre>
}

/** Opens the row and returns the router state the expense page was given. */
async function openRow(expense: ExpenseListItem) {
  renderPage(<ExpenseRow expense={expense} groupId={GROUP} />, {
    path: '/list',
    extra: [{ path: ROUTES.expensePattern, element: <StateProbe /> }],
  })
  await userEvent.click(screen.getByRole('link'))
  const state = (await screen.findByTestId('state')).textContent
  return state === 'null' || state === '' ? null : JSON.parse(state ?? 'null')
}

describe('opening an expense from the list', () => {
  it('hands the expense page what the row knows: ids, description, category, amount, currency and day', async () => {
    expect(await openRow(item)).toEqual({
      expense: { id: EXPENSE, groupId: GROUP, description: 'Beach shack dinner', category: 'food.dining_out', amountMinor: 900, currency: 'GBP', date: '2026-10-05' },
    })
  })

  it('hands a payment over with who paid and who received', async () => {
    const payment: ExpenseListItem = { ...item, category: 'settlement', description: 'Payment', payer: you, recipient: priya }
    expect(await openRow(payment)).toEqual({
      expense: {
        id: EXPENSE,
        groupId: GROUP,
        description: 'Payment',
        category: 'settlement',
        amountMinor: 900,
        currency: 'GBP',
        date: '2026-10-05',
        payer: { email: 'omkar@gmail.com', name: 'Omkar', isYou: true },
        recipient: { email: 'priya@gmail.com', name: 'Priya Shah', isYou: false },
      },
    })
  })

  it('hands a deleted expense over with who deleted it and when', async () => {
    const deleted: ExpenseListItem = { ...item, deleted: { by: priya, at: new Date('2026-10-06T10:00:00Z') } }
    const state = await openRow(deleted)
    expect(state.expense.deleted).toEqual({ by: { email: 'priya@gmail.com', name: 'Priya Shah', isYou: false }, at: '2026-10-06T10:00:00.000Z' })
  })
})

describe('the right side of a row (PRD 5.5)', () => {
  const evenItem: ExpenseListItem = { ...item, yourPaidMinor: 900, yourOwedMinor: 900 }
  const right = (container: HTMLElement) => container.querySelector('div[style*="text-align: end"]') as HTMLElement

  function renderRow(expense: ExpenseListItem, soloGroup?: boolean) {
    return renderPage(<ExpenseRow expense={expense} groupId={GROUP} soloGroup={soloGroup} />, { path: '/list' })
  }

  it('says "no balance" when you paid exactly your own share, in a group of several', () => {
    const { container } = renderRow(evenItem)

    expect(right(container)).toHaveTextContent('no balance')
  })

  it('says what you lent or borrowed, or that you are not involved, in a group of several', () => {
    expect(right(renderRow(item).container)).toHaveTextContent('you lent£4.50')
    cleanup()
    expect(right(renderRow({ ...item, payer: priya, yourPaidMinor: 0, yourOwedMinor: 450 }).container)).toHaveTextContent('you borrowed£4.50')
    cleanup()
    expect(right(renderRow({ ...item, involved: false, yourPaidMinor: 0, yourOwedMinor: 0 }).container)).toHaveTextContent('not involved')
  })

  it('shows just the amount, in bold, in a group of one', () => {
    const { container } = renderRow(evenItem, true)

    expect(right(container)).toHaveTextContent('£9.00')
    expect(right(container).querySelector('strong')).toHaveTextContent('£9.00')
    expect(container).not.toHaveTextContent('no balance')
  })

  it('shows the amount in a group of one for any expense, with no lent, borrowed or involved words', () => {
    for (const expense of [item, { ...item, involved: false, yourPaidMinor: 0, yourOwedMinor: 0 }]) {
      const { container } = renderRow(expense, true)
      expect(right(container).querySelector('strong')).toHaveTextContent('£9.00')
      expect(container).not.toHaveTextContent(/you lent|you borrowed|not involved|no balance/)
      cleanup()
    }
  })

  it('writes the amount in the expense\'s own currency', () => {
    const { container } = renderRow({ ...evenItem, currency: 'INR', amountMinor: 2200 }, true)

    expect(right(container).querySelector('strong')).toHaveTextContent('₹22.00')
  })

  it('keeps who paid under the title', () => {
    renderRow(evenItem, true)

    expect(screen.getByText(/You paid/)).toBeInTheDocument()
  })

  it('leaves a payment as one line with no amount on the right, in a group of one too', () => {
    const payment: ExpenseListItem = { ...item, category: 'settlement', description: 'Payment', payer: you, recipient: priya }
    const { container } = renderRow(payment, true)

    expect(container).toHaveTextContent('You paid Priya £9.00')
    expect(right(container)).toBeNull()
  })
})
