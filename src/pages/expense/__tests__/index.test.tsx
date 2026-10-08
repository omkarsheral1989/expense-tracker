// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { expenses, people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { groupService } from '../../../services/groupService'
import { photoService } from '../../../services/photoService'
import type { CreateExpenseInput } from '../../../services/expenseService/types.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense, personIdOf } from '../../../testing/expenses.ts'
import { renderPage } from '../../../testing/render.tsx'
import { ExpensePage } from '../index.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const testDb = setUpTestDatabase()

async function createGroup(creator: { email: string; name: string } = me, memberEmails = ['priya@gmail.com', 'sam@gmail.com']) {
  const result = await groupService.createGroup(testDb.db, creator, {
    name: 'Goa trip',
    type: 'trip',
    defaultCurrency: 'GBP',
    memberEmails,
  })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
  return result.groupId
}

function renderExpense(groupId: string, expenseId: string) {
  return renderPage(<ExpensePage />, {
    path: ROUTES.expense(groupId, expenseId),
    pattern: ROUTES.expensePattern,
    routes: [ROUTES.groupPattern],
  })
}

async function addExpense(groupId: string, overrides: Partial<CreateExpenseInput> = {}) {
  return addTestExpense(testDb.db, me.email, groupId, {
    description: 'Beach shack dinner',
    category: 'food.dining_out',
    amountMinor: 900,
    date: '2026-10-05',
    ...overrides,
  })
}

describe('ExpensePage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0))
    useAuthStore.setState({ profile: me, token: null })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.mocked(getDb).mockClear()
  })

  it('shows grey placeholders while the expense loads', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id)
    vi.mocked(getDb).mockImplementationOnce(() => new Promise(() => {}))
    renderExpense(id, expenseId)

    expect(screen.getByRole('status', { name: 'Loading the expense' })).toBeInTheDocument()
  })

  it('shows the description, amount, category, day and who added it', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id)
    renderExpense(id, expenseId)

    expect(await screen.findByRole('heading', { name: 'Beach shack dinner' })).toBeInTheDocument()
    expect(screen.getByText('£9.00')).toBeInTheDocument()
    expect(screen.getByText('Dining out · Mon, 5 Oct 2026')).toBeInTheDocument()
    expect(screen.getByText('Added by you')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Dining out' })).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Beach shack dinner · OwnLedger'))
  })

  it('says how it was split and what each person paid and owes, you first', async () => {
    const id = await createGroup()
    const [meId, priyaId, samId] = await Promise.all(
      [me.email, 'priya@gmail.com', 'sam@gmail.com'].map((email) => personIdOf(testDb.db, email)),
    )
    const expenseId = await addExpense(id, {
      paidBy: priyaId,
      split: { method: 'shares', values: { [meId]: 1, [priyaId]: 2, [samId]: 0 } },
    })
    renderExpense(id, expenseId)

    expect(await screen.findByText('Split by shares')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Who paid and owes' })
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'YYou owe £3.00',
      'PPriya Shah paid £9.00 and owes £6.00',
    ])
  })

  it('shows the notes, keeping their lines, and no notes section without them', async () => {
    const id = await createGroup()
    const withNotes = await addExpense(id, { notes: 'Paid by card\nTip included' })
    const page = renderExpense(id, withNotes)

    expect(await screen.findByText('Notes')).toBeInTheDocument()
    expect(screen.getByText(/Paid by card/)).toHaveStyle({ whiteSpace: 'pre-wrap' })
    page.unmount()

    const without = await addExpense(id, { description: 'Taxi' })
    renderExpense(id, without)
    await screen.findByRole('heading', { name: 'Taxi' })
    expect(screen.queryByText('Notes')).not.toBeInTheDocument()
  })

  it('shows the receipt photos as thumbnails, each opening the photo at full size', async () => {
    const id = await createGroup()
    const store = photoService.open(me.id)
    const receipts = await photoService.storeReceipts(store, [
      new File(['first'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['second'], 'b.jpg', { type: 'image/jpeg' }),
    ])
    const expenseId = await addExpense(id, { receipts })
    renderExpense(id, expenseId)

    expect(await screen.findByText('Receipts')).toBeInTheDocument()
    const gallery = screen.getByRole('list', { name: 'Receipt photos' })
    const first = await within(gallery).findByRole('img', { name: 'Receipt photo 1' })
    expect(await within(gallery).findByRole('img', { name: 'Receipt photo 2' })).toBeInTheDocument()
    expect(first.getAttribute('src')).toMatch(/^blob:/)

    await userEvent.click(first)

    // The preview shows the original photo, a different picture from the thumbnail.
    const preview = await waitFor(() => {
      const image = document.querySelector('.ant-image-preview img')
      expect(image).not.toBeNull()
      return image as HTMLImageElement
    })
    expect(preview.getAttribute('src')).toMatch(/^blob:/)
    expect(preview.getAttribute('src')).not.toBe(first.getAttribute('src'))
  })

  it('says when a receipt photo is not on this device', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id, {
      receipts: [{ id: crypto.randomUUID(), mimeType: 'image/jpeg', sizeBytes: 10 }],
    })
    renderExpense(id, expenseId)

    expect(await screen.findByRole('img', { name: 'Receipt photo 1, not on this device' })).toHaveTextContent(
      'Not on this device',
    )
  })

  it('has no receipts section for an expense without photos', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id)
    renderExpense(id, expenseId)

    await screen.findByRole('heading', { name: 'Beach shack dinner' })
    expect(screen.queryByText('Receipts')).not.toBeInTheDocument()
  })

  it('names who added it when it was someone else', async () => {
    const priya = { email: 'priya@gmail.com', name: 'Priya Shah' }
    const id = await createGroup(priya, [me.email])
    await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, priya.email))
    const expenseId = await addTestExpense(testDb.db, priya.email, id, { description: 'Groceries' })
    renderExpense(id, expenseId)

    expect(await screen.findByText('Added by Priya Shah')).toBeInTheDocument()
  })

  it('switches off editing and deleting, saying "Coming soon"', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id)
    renderExpense(id, expenseId)

    const edit = await screen.findByRole('button', { name: /Edit$/ })
    expect(edit).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    await userEvent.hover(edit.parentElement as HTMLElement)
    expect(await screen.findByText('Coming soon')).toBeInTheDocument()
  })

  it('goes back to the group with Back', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id)
    const { currentPath } = renderExpense(id, expenseId)

    await userEvent.click(await screen.findByRole('button', { name: 'Back' }))

    expect(currentPath()).toBe(ROUTES.group(id))
  })

  it('says "Expense not found" for a deleted or unknown expense, with a way back', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id)
    await testDb.db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, expenseId))
    const { currentPath } = renderExpense(id, expenseId)

    expect(await screen.findByText('Expense not found')).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Expense not found · OwnLedger'))
    await userEvent.click(screen.getByRole('button', { name: 'Back to the group' }))
    expect(currentPath()).toBe(ROUTES.group(id))
  })

  it('says so when the expense cannot be loaded, and loads it on "Try again"', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id)
    vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))
    renderExpense(id, expenseId)

    expect(await screen.findByText("Couldn't load this expense")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Beach shack dinner' })).toBeInTheDocument()
  })
})
