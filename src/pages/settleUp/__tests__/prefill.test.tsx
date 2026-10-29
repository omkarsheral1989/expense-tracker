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
  return renderPage(<SettleUpPage />, { path: ROUTES.settleUp(groupId), pattern: ROUTES.settleUpPattern, routes: [ROUTES.groupPattern, ROUTES.home], state })
}

const payerSelect = () => screen.getByRole('combobox', { name: 'Who paid?' })
const recipientSelect = () => screen.getByRole('combobox', { name: 'Who received it?' })
const amountInput = () => screen.getByRole('textbox', { name: 'Amount' })
const sentence = () => screen.queryByRole('heading', { level: 4 })?.textContent ?? null

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
