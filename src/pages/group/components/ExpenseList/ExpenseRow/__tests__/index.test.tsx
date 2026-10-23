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

  it('hands over nothing for a payment, whose page is worded by who paid whom', async () => {
    const payment: ExpenseListItem = { ...item, category: 'settlement', description: 'Payment', payer: you, recipient: priya }
    expect(await openRow(payment)).toBeNull()
  })

  it('hands over nothing for a deleted expense, which opens read-only', async () => {
    const deleted: ExpenseListItem = { ...item, deleted: { by: priya, at: new Date('2026-10-06T10:00:00Z') } }
    expect(await openRow(deleted)).toBeNull()
  })
})
