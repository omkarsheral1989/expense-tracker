// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { expenseEvents, people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { expenseService } from '../../../services/expenseService'
import type { CreateExpenseInput } from '../../../services/expenseService/types.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense, addTestSettlement, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
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

async function createGroup() {
  const result = await createTestGroup(testDb.db, me, {
    name: 'Goa trip',
    type: 'trip',
    defaultCurrency: 'GBP',
    memberEmails: ['priya@gmail.com', 'sam@gmail.com'],
  })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
  return result.groupId
}

function renderExpense(groupId: string, expenseId: string) {
  return renderPage(<ExpensePage />, {
    path: ROUTES.expense(groupId, expenseId),
    pattern: ROUTES.expensePattern,
    routes: [ROUTES.groupPattern, ROUTES.editExpensePattern, ROUTES.expenseVersionPattern],
  })
}

/** "Beach shack dinner", 9.00 GBP on 5 Oct 2026, added by you at 12:00. */
async function addExpense(groupId: string, overrides: Partial<CreateExpenseInput> = {}) {
  return addTestExpense(testDb.db, me.email, groupId, {
    description: 'Beach shack dinner',
    category: 'food.dining_out',
    amountMinor: 900,
    date: '2026-10-05',
    ...overrides,
  })
}

/** Saves an edit by `email` at the given time of day (20 Oct 2026): the saved expense with the fields given replaced. */
async function editAt(
  email: string,
  groupId: string,
  expenseId: string,
  hour: number,
  minute: number,
  overrides: Partial<CreateExpenseInput>,
) {
  vi.setSystemTime(new Date(2026, 9, 20, hour, minute))
  const userId = await personIdOf(testDb.db, email)
  const saved = await expenseService.getExpenseToEdit(testDb.db, userId, groupId, expenseId)
  if (!saved) throw new Error('Not editable.')
  const result = await expenseService.updateExpense(testDb.db, userId, groupId, expenseId, {
    description: saved.description,
    category: saved.category,
    amountMinor: saved.amountMinor,
    currency: saved.currency,
    date: saved.date,
    notes: saved.notes ?? '',
    paidBy: saved.paidBy,
    split: saved.split,
    receipts: saved.receipts,
    ...overrides,
  })
  if (!result.ok) throw new Error(JSON.stringify(result))
}

const history = () => screen.getByRole('list', { name: 'History' })
/** The entries themselves, not the bullets inside them. */
const entries = () => [...history().children] as HTMLElement[]
/** Each entry's text, header first. */
const entryTexts = () => entries().map((entry) => entry.textContent)

describe('ExpensePage: history', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 20, 12, 0))
    useAuthStore.setState({ profile: me, token: null })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.mocked(getDb).mockClear()
  })

  it('is shown for an expense that was never edited, with only the entry that it was added', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id)
    renderExpense(id, expenseId)

    await screen.findByRole('heading', { name: 'Beach shack dinner' })
    expect(await screen.findByText('History')).toBeInTheDocument()
    expect(entries()).toHaveLength(1)
    expect(entries()[0].textContent).toMatch(/^You added this expense · /)
  })

  it('is shown for a payment between members, with the entry that it was added', async () => {
    const id = await createGroup()
    const payment = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id)
    renderExpense(id, payment)

    await screen.findByRole('heading', { name: 'You paid Priya' })
    expect(await screen.findByText('History')).toBeInTheDocument()
    expect(entries()[0].textContent).toMatch(/^You added this payment · /)
  })

  it('comes last on the page, after the receipts, under the heading "History"', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id, {
      notes: 'Card',
      receipts: [{ id: crypto.randomUUID(), mimeType: 'image/jpeg', sizeBytes: 10 }],
    })
    await editAt(me.email, id, expenseId, 13, 0, { description: 'Lunch' })
    renderExpense(id, expenseId)

    const heading = await screen.findByText('History')
    const receipts = screen.getByText('Receipts')
    expect(receipts.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(heading.compareDocumentPosition(history()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('lists each edit newest first with who, when and what changed, and last who added it and when', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id)
    await editAt(me.email, id, expenseId, 13, 5, { description: 'Lunch', amountMinor: 1200 })
    await editAt('priya@gmail.com', id, expenseId, 15, 30, { notes: 'Cash' })
    renderExpense(id, expenseId)

    await screen.findByText('History')
    expect(entryTexts()).toEqual([
      "Priya Shah edited this expense · 20 Oct 2026, 3:30 PMNotes added: 'Cash'",
      "You edited this expense · 20 Oct 2026, 1:05 PMDescription changed from 'Beach shack dinner' to 'Lunch'Cost changed from £9.00 to £12.00",
      'You added this expense · 20 Oct 2026, 12:00 PM',
    ])
  })

  it('writes the lines of one edit as bullets, in a fixed order', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id, { notes: 'Card' })
    await editAt(me.email, id, expenseId, 14, 0, {
      description: 'Dinner at the shack',
      category: 'food.groceries',
      amountMinor: 1000,
      date: '2026-10-06',
      notes: '',
    })
    renderExpense(id, expenseId)

    await screen.findByText('History')
    const [edit] = entries()
    expect(within(edit).getAllByRole('listitem').map((line) => line.textContent)).toEqual([
      "Description changed from 'Beach shack dinner' to 'Dinner at the shack'",
      "Notes removed (were 'Card')",
      'Category changed from Dining out to Groceries',
      'Cost changed from £9.00 to £10.00',
      'Date changed from 5 Oct 2026 to 6 Oct 2026',
    ])
  })

  it('names who paid, and nests a line under a changed split for each person whose number changed', async () => {
    const id = await createGroup()
    const [meId, priyaId, samId] = await Promise.all(
      [me.email, 'priya@gmail.com', 'sam@gmail.com'].map((email) => personIdOf(testDb.db, email)),
    )
    const expenseId = await addExpense(id, {
      split: { method: 'percent', values: { [meId]: 50, [priyaId]: 30, [samId]: 20 } },
    })
    await editAt(me.email, id, expenseId, 14, 0, {
      paidBy: priyaId,
      split: { method: 'percent', values: { [meId]: 40, [priyaId]: 40, [samId]: 20 } },
    })
    renderExpense(id, expenseId)

    await screen.findByText('History')
    const [edit] = entries()
    const lines = within(edit).getAllByRole('listitem')
    expect(lines.map((line) => line.textContent)).toEqual([
      'Paid by changed from you to Priya Shah',
      'Split changedYou: 50% to 40%Priya Shah: 30% to 40%',
      'You: 50% to 40%',
      'Priya Shah: 30% to 40%',
    ])
  })

  it('says "You edited" for your own edits and the person\'s name for others\', as seen by each of them', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id)
    await editAt('priya@gmail.com', id, expenseId, 14, 0, { description: 'Lunch' })

    renderExpense(id, expenseId)
    await screen.findByText('History')
    expect(entryTexts()[0]).toMatch(/^Priya Shah edited this expense/)
    cleanup()

    // Seen by Priya.
    useAuthStore.setState({ profile: { id: '2', email: 'priya@gmail.com', name: 'Priya Shah' }, token: null })
    renderExpense(id, expenseId)
    await screen.findByText('History')
    expect(entryTexts()[0]).toMatch(/^You edited this expense/)
    expect(entryTexts()[1]).toMatch(/^Omkar Sheral added this expense/)
  })

  it('says who added it by name when someone else did', async () => {
    const id = await createGroup()
    const expenseId = await addTestExpense(testDb.db, 'priya@gmail.com', id, {
      description: 'Taxi',
      amountMinor: 500,
      date: '2026-10-05',
    })
    await editAt('priya@gmail.com', id, expenseId, 14, 0, { description: 'Taxi home' })
    renderExpense(id, expenseId)

    await screen.findByText('History')
    expect(entryTexts().at(-1)).toBe('Priya Shah added this expense · 20 Oct 2026, 12:00 PM')
  })

  describe('opening a version', () => {
    it('makes every entry a link to the version of that event, the newest and the adding too', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await editAt(me.email, id, expenseId, 13, 0, { description: 'Lunch' })
      const meId = await personIdOf(testDb.db, me.email)
      vi.setSystemTime(new Date(2026, 9, 21, 14, 0))
      await expenseService.deleteExpense(testDb.db, meId, id, expenseId)
      renderExpense(id, expenseId)

      await screen.findByText('History')
      const events = await testDb.db.select().from(expenseEvents).where(eq(expenseEvents.expenseId, expenseId))
      const links = within(history()).getAllByRole('link')
      // Newest first: deleted, edited, added.
      expect(links.map((link) => link.getAttribute('href'))).toEqual(
        ['deleted', 'edited', 'added'].map((kind) => ROUTES.expenseVersion(id, expenseId, events.find((event) => event.kind === kind)!.id)),
      )
      expect(links.map((link) => link.textContent?.split(' · ')[0])).toEqual([
        'You deleted this expense',
        'You edited this expense',
        'You added this expense',
      ])
    })

    it('opens the version of an entry when it is tapped', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await editAt(me.email, id, expenseId, 13, 0, { description: 'Lunch' })
      const page = renderExpense(id, expenseId)
      await screen.findByText('History')
      const [, added] = within(history()).getAllByRole('link')
      const [addedEvent] = (await testDb.db.select().from(expenseEvents).where(eq(expenseEvents.expenseId, expenseId)))
        .filter((event) => event.kind === 'added')

      await userEvent.click(added)

      expect(page.currentPath()).toBe(ROUTES.expenseVersion(id, expenseId, addedEvent.id))
    })

    it('shows the plain header for a version that was put back: "You restored the version from …", with what changed back', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await editAt(me.email, id, expenseId, 13, 0, { description: 'Lunch', amountMinor: 1200 })
      const meId = await personIdOf(testDb.db, me.email)
      const [added] = await testDb.db.select().from(expenseEvents).where(eq(expenseEvents.kind, 'added'))
      vi.setSystemTime(new Date(2026, 9, 21, 9, 30))
      await expenseService.restoreVersion(testDb.db, meId, id, expenseId, added.id)
      renderExpense(id, expenseId)

      await screen.findByText('History')
      const [reverted] = entries()
      expect(reverted.textContent).toMatch(/^You restored the version from 20 Oct 2026, 12:00\s?PM · 21 Oct 2026, 9:30\s?AM/)
      expect(within(reverted).getAllByRole('listitem').map((line) => line.textContent)).toEqual([
        "Description changed from 'Lunch' to 'Beach shack dinner'",
        'Cost changed from £12.00 to £9.00',
      ])
      // The edit is now an older entry.
      expect(entries()).toHaveLength(3)
    })
  })

  it('counts photos added and removed', async () => {
    const id = await createGroup()
    const [a, b] = [crypto.randomUUID(), crypto.randomUUID()].map((photoId) => ({ id: photoId, mimeType: 'image/jpeg', sizeBytes: 10 }))
    const expenseId = await addExpense(id, { receipts: [a] })
    await editAt(me.email, id, expenseId, 14, 0, { receipts: [b] })
    renderExpense(id, expenseId)

    await screen.findByText('History')
    const [edit] = entries()
    expect(within(edit).getAllByRole('listitem').map((line) => line.textContent)).toEqual([
      '1 photo added',
      '1 photo removed',
    ])
  })
})
