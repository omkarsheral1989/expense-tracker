// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expenses, people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup, ensurePersonId } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { BalancesPage } from '../../balances/index.tsx'
import { SettleUpPage } from '../index.tsx'

vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const testDb = setUpTestDatabase()

async function createGroup() {
  const result = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
  if (!result.ok) throw new Error('group')
  await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
  await testDb.db.update(people).set({ name: 'Sam' }).where(eq(people.email, 'sam@gmail.com'))
  return result.groupId
}

function renderSettleUp(groupId: string, state?: unknown) {
  return renderPage(<SettleUpPage />, { path: ROUTES.settleUp(groupId), pattern: ROUTES.settleUpPattern, routes: [ROUTES.groupPattern, ROUTES.home], extra: [{ path: ROUTES.balancesPattern, element: <BalancesPage /> }], state })
}

const payerSelect = () => screen.getByRole('combobox', { name: 'Who paid?' })
const recipientSelect = () => screen.getByRole('combobox', { name: 'Who received it?' })
const amountInput = () => screen.getByRole('textbox', { name: 'Amount' })
/** Who paid whom, as the payment row below the dropdowns says it to assistive technology ("You paid Priya"); null until a recipient is chosen. */
const sentence = () => screen.queryByRole('group', { name: /paid/ })?.getAttribute('aria-label') ?? null

/** What the balances page hands Settle up: Sam pays Priya 12.50 US dollars. */
async function samPaysPriya(overrides: Record<string, unknown> = {}) {
  return {
    settle: {
      payerId: await personIdOf(testDb.db, 'sam@gmail.com'),
      recipientId: await personIdOf(testDb.db, 'priya@gmail.com'),
      amountMinor: 1250,
      currency: 'USD',
      ...overrides,
    },
  }
}

beforeEach(async () => {
  useAuthStore.setState({ profile: me, token: null })
  await ensurePersonId(testDb.db, me.email, me.name)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Settle up opened with a payment from the balances page (PRD 5.21)', () => {
  it('starts with the payer, the recipient, the amount and the currency filled in', async () => {
    const groupId = await createGroup()
    renderSettleUp(groupId, await samPaysPriya())

    await screen.findByRole('heading', { name: 'Settle up' })
    expect(within(payerSelect().closest('.ant-form-item') as HTMLElement).getByText('Sam')).toBeInTheDocument()
    expect(within(recipientSelect().closest('.ant-form-item') as HTMLElement).getByText('Priya Shah')).toBeInTheDocument()
    expect(sentence()).toBe('Sam paid Priya')
    expect(amountInput()).toHaveValue('12.50')
    expect(screen.getByRole('button', { name: 'Currency: USD' })).toBeInTheDocument()
  })

  it('keeps every field editable, and saves the payment as it was filled in', async () => {
    const groupId = await createGroup()
    const page = renderSettleUp(groupId, await samPaysPriya())
    await screen.findByRole('heading', { name: 'Settle up' })
    await userEvent.clear(amountInput())
    await userEvent.type(amountInput(), '10')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(groupId)))
    const [payment] = await testDb.db.select().from(expenses)
    expect(payment).toMatchObject({ amountMinor: 1000, currency: 'USD', category: 'settlement' })
  })

  it('does not count the filled-in payment as unsaved input, so Back leaves without asking', async () => {
    const groupId = await createGroup()
    const page = renderSettleUp(groupId, await samPaysPriya())
    await screen.findByRole('heading', { name: 'Settle up' })

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(groupId)))
    expect(screen.queryByText('Discard this payment?')).toBeNull()
  })

  it('asks "Discard this payment?" once the filled-in payment has been changed', async () => {
    const groupId = await createGroup()
    renderSettleUp(groupId, await samPaysPriya())
    await screen.findByRole('heading', { name: 'Settle up' })
    await userEvent.clear(amountInput())
    await userEvent.type(amountInput(), '9')

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(await screen.findByRole('dialog', { name: 'Discard this payment?' })).toBeInTheDocument()
  })

  it('opens as the plain form, you paying nobody yet, when the state is not a valid payment between members', async () => {
    const groupId = await createGroup()
    renderSettleUp(groupId, await samPaysPriya({ recipientId: await personIdOf(testDb.db, 'sam@gmail.com') }))

    await screen.findByRole('heading', { name: 'Settle up' })
    expect(within(payerSelect().closest('.ant-form-item') as HTMLElement).getByText('You')).toBeInTheDocument()
    expect(within(recipientSelect().closest('.ant-form-item') as HTMLElement).getByText('Choose a person')).toBeInTheDocument()
    expect(amountInput()).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Currency: GBP' })).toBeInTheDocument()
  })

  it('ignores a person who is not in the group', async () => {
    const groupId = await createGroup()
    renderSettleUp(groupId, await samPaysPriya({ payerId: '3f2a9c1e-0000-4000-8000-0000000000aa' }))

    await screen.findByRole('heading', { name: 'Settle up' })
    expect(amountInput()).toHaveValue('')
  })
})

describe('where Settle up leads back to (PRD 5.7, 5.21)', () => {
  async function fromBalances() {
    return { ...(await samPaysPriya()), from: 'balances' }
  }

  it('goes back to the balances page with Back when the balances page opened it', async () => {
    const groupId = await createGroup()
    const page = renderSettleUp(groupId, await fromBalances())
    await screen.findByRole('heading', { name: 'Settle up' })

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.balances(groupId)))
  })

  it('goes back to the balances page with Discard, after the filled-in payment was changed', async () => {
    const groupId = await createGroup()
    const page = renderSettleUp(groupId, await fromBalances())
    await screen.findByRole('heading', { name: 'Settle up' })
    await userEvent.clear(amountInput())
    await userEvent.type(amountInput(), '9')
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }))

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.balances(groupId)))
  })

  it('goes to the balances page after the payment is saved', async () => {
    const groupId = await createGroup()
    const page = renderSettleUp(groupId, await fromBalances())
    await screen.findByRole('heading', { name: 'Settle up' })

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.balances(groupId)))
    expect(await testDb.db.select().from(expenses)).toHaveLength(1)
  })

  it('reads the balances again after Save, so the balances page comes back with the payment and no loader', async () => {
    const groupId = await createGroup()
    const page = renderSettleUp(groupId, await fromBalances())
    await screen.findByRole('heading', { name: 'Settle up' })

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.balances(groupId)))
    expect(screen.queryByRole('status', { name: 'Loading the balances' })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Balances' })).toBeInTheDocument()
  })

  it('goes to the group page with Back when the balances page did not open it', async () => {
    const groupId = await createGroup()
    const page = renderSettleUp(groupId, await samPaysPriya())
    await screen.findByRole('heading', { name: 'Settle up' })

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(groupId)))
  })

  it('goes to the group page after Save when the balances page did not open it', async () => {
    const groupId = await createGroup()
    const page = renderSettleUp(groupId, await samPaysPriya())
    await screen.findByRole('heading', { name: 'Settle up' })

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(groupId)))
  })
})
