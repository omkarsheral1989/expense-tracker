// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderPage } from '../../../testing/render.tsx'
import { ExpenseVersionPage } from '../index.tsx'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { addTestSettlement } from '../../../testing/expenses.ts'
import { ACTIVITY_FROM } from '../../activity/constants.ts'
import { me, named, setUpVersionTests } from './helpers.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const { testDb, createGroup, addExpense, eventsOf, renderVersion } = setUpVersionTests()

beforeEach(() => useAuthStore.setState({ profile: me, token: null }))
afterEach(cleanup)

async function setUp() {
  const groupId = await createGroup()
  const expenseId = await addExpense(groupId)
  const [added] = await eventsOf(expenseId)
  return { groupId, expenseId, eventId: added.id }
}

describe('the version page opened from Activity (PRD 5.6c, 5.18)', () => {
  it('has Back return to Activity', async () => {
    const { groupId, expenseId, eventId } = await setUp()
    const page = renderVersion(groupId, expenseId, eventId, { from: ACTIVITY_FROM })

    await userEvent.click(await screen.findByRole('button', { name: 'Back' }))

    expect(page.currentPath()).toBe(ROUTES.activity)
  })

  it('has Back go to the expense when opened any other way, or with a state it does not know', async () => {
    const { groupId, expenseId, eventId } = await setUp()
    for (const state of [undefined, { from: 'somewhere' }, { from: 42 }]) {
      const page = renderVersion(groupId, expenseId, eventId, state)

      await userEvent.click(await screen.findByRole('button', { name: 'Back' }))

      expect(page.currentPath()).toBe(ROUTES.expense(groupId, expenseId))
      cleanup()
    }
  })
})

describe('the Open expense button of the version page', () => {
  it('is a white pill button that opens the expense', async () => {
    const { groupId, expenseId, eventId } = await setUp()
    const page = renderVersion(groupId, expenseId, eventId)

    const button = await screen.findByRole('button', { name: named('Open expense') })
    expect(button).toHaveStyle({ borderRadius: '999px' })
    expect(button).toHaveClass('ant-btn-default')
    await userEvent.click(button)

    expect(page.currentPath()).toBe(ROUTES.expense(groupId, expenseId))
  })

  it('hands the expense this version\'s address, so its Back arrow returns here', async () => {
    const { groupId, expenseId, eventId } = await setUp()
    function ShowState() {
      return <p>{JSON.stringify(useLocation().state)}</p>
    }
    renderPage(<ExpenseVersionPage />, {
      path: ROUTES.expenseVersion(groupId, expenseId, eventId),
      pattern: ROUTES.expenseVersionPattern,
      extra: [{ path: ROUTES.expensePattern, element: <ShowState /> }],
    })

    await userEvent.click(await screen.findByRole('button', { name: named('Open expense') }))

    expect(await screen.findByText(JSON.stringify({ backTo: ROUTES.expenseVersion(groupId, expenseId, eventId) }))).toBeInTheDocument()
  })

  it('says Open payment on a payment', async () => {
    const groupId = await createGroup()
    const paymentId = await addTestSettlement(testDb.db, 'priya@gmail.com', me.email, groupId)
    const [added] = await eventsOf(paymentId)
    renderVersion(groupId, paymentId, added.id)

    expect(await screen.findByRole('button', { name: named('Open payment') })).toBeInTheDocument()
  })
})
