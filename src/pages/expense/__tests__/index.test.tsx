// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { expenseService } from '../../../services/expenseService'
import { photoService } from '../../../services/photoService'
import type { CreateExpenseInput } from '../../../services/expenseService/types.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense, addTestSettlement, expenseInput, personIdOf } from '../../../testing/expenses.ts'
import { renderPage } from '../../../testing/render.tsx'
import { ExpensePage } from '../index.tsx'
import { expectCenteredMessage } from '../../../testing/centered.ts'
import { createTestGroup } from '../../../testing/groups.ts'

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
  const result = await createTestGroup(testDb.db, creator, {
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
    routes: [ROUTES.groupPattern, ROUTES.editExpensePattern],
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

/** Matches a button by the end of its name, which an icon's name leads. */
function named(text: string) {
  return new RegExp(`(?<!\\d)${text}$`)
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

  it('shows the description, amount, category, day and who paid', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id)
    renderExpense(id, expenseId)

    expect(await screen.findByRole('heading', { name: 'Beach shack dinner' })).toBeInTheDocument()
    expect(screen.getByText('£9.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: named('Mon, 5 Oct 2026') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: named('Dining out') })).toBeInTheDocument()
    expect(screen.getByText('You paid £9.00')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Dining out' }).length).toBeGreaterThan(0)
    // Who added it is in the history, not on the band.
    expect(screen.queryByText(/^Added by/)).not.toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Beach shack dinner · OwnLedger'))
  })

  describe('a payment between two members', () => {
    it('is titled by who paid whom, with its amount, category and day, and has no split', async () => {
      const id = await createGroup()
      const expenseId = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id, { amountMinor: 4550, date: '2026-10-05' })
      renderExpense(id, expenseId)

      expect(await screen.findByRole('heading', { name: 'You paid Priya' })).toBeInTheDocument()
      expect(screen.getByText('£45.50')).toBeInTheDocument()
      expect(screen.getByText('Mon, 5 Oct 2026')).toBeInTheDocument()
      expect(screen.getByText('Settlement')).toBeInTheDocument()
      await waitFor(() => expect(document.title).toBe('You paid Priya · OwnLedger'))
      expect(screen.queryByText(/^Split by/)).not.toBeInTheDocument()
      expect(screen.queryByRole('list', { name: 'Who owes' })).not.toBeInTheDocument()
      expect(screen.queryByText(/ paid £/)).not.toBeInTheDocument()
      // The stored description "Payment" is not shown as the title; the only "Payment" is the header's.
      expect(screen.getAllByText('Payment')).toHaveLength(1)
    })

    it('says "Priya paid you" when you received it, and names both when it was between others', async () => {
      const id = await createGroup()
      const toYou = await addTestSettlement(testDb.db, 'priya@gmail.com', me.email, id)
      const between = await addTestSettlement(testDb.db, 'priya@gmail.com', 'sam@gmail.com', id)

      renderExpense(id, toYou)
      expect(await screen.findByRole('heading', { name: 'Priya paid you' })).toBeInTheDocument()
      cleanup()

      renderExpense(id, between)
      expect(await screen.findByRole('heading', { name: 'Priya paid Sam' })).toBeInTheDocument()
      // It was recorded by Priya, who paid: the history says so.
      expect(await screen.findByText('Priya Shah added this payment')).toBeInTheDocument()
    })

    it('shows its notes and receipts like any expense', async () => {
      const id = await createGroup()
      const expenseId = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id, { notes: 'Cash at the airport' })
      renderExpense(id, expenseId)

      expect(await screen.findByText('Notes')).toBeInTheDocument()
      expect(screen.getByText('Cash at the airport')).toBeInTheDocument()
    })
  })

  it('says who paid under who added it, and lists what each person owes, you first', async () => {
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
    expect(screen.getByText('Priya Shah paid £9.00')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Who owes' })
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'YYou owe £3.00',
      'PPriya Shah owes £6.00',
    ])
  })

  it('shows a person\'s Google picture beside what they owe, and the letter for someone without one', async () => {
    const id = await createGroup()
    await testDb.db.update(people).set({ picture: 'https://example.com/priya.png' }).where(eq(people.email, 'priya@gmail.com'))
    const expenseId = await addExpense(id)
    renderExpense(id, expenseId)

    const list = await screen.findByRole('list', { name: 'Who owes' })
    const rows = within(list).getAllByRole('listitem')
    const priya = rows.find((row) => /Priya Shah/.test(row.textContent ?? ''))!
    expect(priya.querySelector('img')).toHaveAttribute('src', 'https://example.com/priya.png')
    expect(rows.filter((row) => row.querySelector('img'))).toHaveLength(1)
  })

  it('leaves a payer who owes nothing out of the list', async () => {
    const id = await createGroup()
    const [meId, priyaId, samId] = await Promise.all(
      [me.email, 'priya@gmail.com', 'sam@gmail.com'].map((email) => personIdOf(testDb.db, email)),
    )
    const expenseId = await addExpense(id, {
      paidBy: priyaId,
      split: { method: 'equal', values: { [meId]: 1, [priyaId]: 0, [samId]: 0 } },
    })
    renderExpense(id, expenseId)

    expect(await screen.findByText('Priya Shah paid £9.00')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Who owes' })
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['YYou owe £9.00'])
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

  it('names who added it in the history when it was someone else', async () => {
    const priya = { email: 'priya@gmail.com', name: 'Priya Shah' }
    const id = await createGroup(priya, [me.email])
    await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, priya.email))
    const expenseId = await addTestExpense(testDb.db, priya.email, id, { description: 'Groceries' })
    renderExpense(id, expenseId)

    expect(await screen.findByText('Priya Shah added this expense')).toBeInTheDocument()
  })

  it('has a quiet header title beside Back: "Expense", or "Payment" for a payment, a level 3 heading of 32 px, thin and in capitals, and an outlined Back button', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id)
    const payment = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id)

    renderExpense(id, expenseId)
    const title = await screen.findByRole('heading', { name: 'Expense', level: 3 })
    expect(title).toHaveStyle({ fontSize: '32px', fontWeight: '100', lineHeight: '40px', textTransform: 'uppercase' })
    expect(title.parentElement).toContainElement(screen.getByRole('button', { name: 'Back' }))
    // Back is an outlined circle like the Delete button, not a bare icon.
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('ant-btn-variant-outlined')
    // The expense's own title below it stays the large one.
    expect(screen.getByRole('heading', { name: 'Beach shack dinner' })).not.toHaveStyle({ fontSize: '20px' })
    cleanup()

    renderExpense(id, payment)
    expect(await screen.findByRole('heading', { name: 'Payment', level: 3 })).toHaveStyle({ fontSize: '32px', fontWeight: '100', lineHeight: '40px', textTransform: 'uppercase' })
  })

  describe('the colored band', () => {
    function band() {
      return (screen.getByRole('heading', { name: 'Expense', level: 3 }).closest('div[style*="gradient"]')) as HTMLElement
    }

    it('is in the color of the expense\'s category group, edge to edge, with Back, the title and the buttons on it', async () => {
      const id = await createGroup()
      const dinner = await addExpense(id)
      const general = await addExpense(id, { description: 'Misc', category: 'general' })

      renderExpense(id, dinner)
      await screen.findByRole('heading', { name: 'Expense', level: 3 })
      // Food and drink is orange.
      expect(band().style.background).toContain('rgb(232, 89, 12)')
      expect(band()).toContainElement(screen.getByRole('button', { name: 'Back' }))
      expect(band()).toContainElement(screen.getByRole('button', { name: 'Edit' }))
      expect(band()).toContainElement(screen.getByRole('button', { name: 'Delete' }))
      cleanup()

      renderExpense(id, general)
      await screen.findByRole('heading', { name: 'Expense', level: 3 })
      expect(band().style.background).toContain('rgb(134, 142, 150)')
    })

    it('has round white buttons for Back, Edit and Delete', async () => {
      const id = await createGroup()
      renderExpense(id, await addExpense(id))

      for (const name of ['Back', 'Edit', 'Delete']) {
        const button = await screen.findByRole('button', { name })
        expect(button).toHaveClass('ant-btn-circle', 'ant-btn-icon-only')
        expect(button).toHaveStyle({ background: '#fff' })
      }
    })

    it('shows the amount above the description, a 40 px line like the icon beside it, all in white', async () => {
      const id = await createGroup()
      renderExpense(id, await addExpense(id))

      const description = await screen.findByRole('heading', { name: 'Beach shack dinner' })
      const amount = screen.getByText('£9.00')
      expect(amount).toHaveStyle({ fontSize: '28px', fontWeight: '600', lineHeight: '40px', color: '#fff' })
      expect(description).toHaveStyle({ color: '#fff' })
      // The amount comes first in the band's text column.
      expect(amount.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      // The category's icon stands alone, 40 px and white, with no tile.
      const icon = screen.getByRole('img', { name: 'Dining out' })
      expect(icon).toHaveStyle({ fontSize: '40px', color: '#fff' })
      expect(icon.style.background).toBe('')
    })

    it('shows the day and then the category as chips, like the group page, and no text lines for who added or edited it', async () => {
      const id = await createGroup()
      renderExpense(id, await addExpense(id))

      const day = await screen.findByRole('button', { name: named('Mon, 5 Oct 2026') })
      const category = screen.getByRole('button', { name: named('Dining out') })
      expect(band()).toContainElement(day)
      expect(band()).toContainElement(category)
      expect(day.compareDocumentPosition(category) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      for (const chip of [day, category]) {
        expect(chip).toHaveStyle({ color: '#fff', background: 'rgba(0, 0, 0, 0.28)' })
      }
      expect(screen.queryByText(/^Added by/)).not.toBeInTheDocument()
      expect(screen.queryByText(/^Edited by/)).not.toBeInTheDocument()
    })

    it('opens the edit page from either chip', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      for (const chip of ['Mon, 5 Oct 2026', 'Dining out']) {
        const { currentPath } = renderExpense(id, expenseId)
        await userEvent.click(await screen.findByRole('button', { name: named(chip) }))
        expect(currentPath()).toBe(ROUTES.editExpense(id, expenseId))
        cleanup()
      }
    })

    it('does not make the chips open the edit page for a payment or a deleted expense', async () => {
      const id = await createGroup()
      const payment = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id, { date: '2026-10-05' })
      const { currentPath, unmount } = renderExpense(id, payment)
      await userEvent.click(await screen.findByText('Mon, 5 Oct 2026'))
      expect(currentPath()).toBe(ROUTES.expense(id, payment))
      unmount()

      const expenseId = await addExpense(id)
      await expenseService.deleteExpense(testDb.db, await personIdOf(testDb.db, me.email), id, expenseId)
      const deleted = renderExpense(id, expenseId)
      await userEvent.click(await screen.findByText('Mon, 5 Oct 2026'))
      expect(deleted.currentPath()).toBe(ROUTES.expense(id, expenseId))
    })

    it('puts who paid below the band as a row with their picture, above the split, not on the band', async () => {
      const id = await createGroup()
      renderExpense(id, await addExpense(id))

      const row = (await screen.findByText('You paid £9.00')).closest('[role="listitem"]') as HTMLElement
      expect(row).not.toBeNull()
      expect(band()).not.toContainElement(row)
      expect((row.parentElement as HTMLElement).getAttribute('aria-label')).toBe('Who paid')
      // The avatar (the initial, as nobody has a picture) sits beside the sentence, like the rows of the split.
      expect(row.querySelector('.ant-avatar')).not.toBeNull()
      expect(row.compareDocumentPosition(screen.getByText('Split equally')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('has no who-paid row on a payment, whose title says who paid whom', async () => {
      const id = await createGroup()
      const payment = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id)
      renderExpense(id, payment)

      await screen.findByRole('heading', { name: 'You paid Priya' })
      expect(screen.queryByRole('list', { name: 'Who paid' })).not.toBeInTheDocument()
    })

    it('keeps the split, notes and receipts below the band, in the column', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id, { notes: 'Table by the sea' })
      renderExpense(id, expenseId)

      await screen.findByRole('heading', { name: 'Expense', level: 3 })
      expect(band()).not.toContainElement(screen.getByText('Split equally'))
      expect(band()).not.toContainElement(screen.getByText('Table by the sea'))
      // The summary appears once, on the band, not again below it.
      expect(screen.getAllByText('Beach shack dinner')).toHaveLength(1)
    })

    it('has a round white Restore button in place of Edit and Delete on a deleted expense', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      await expenseService.deleteExpense(testDb.db, await personIdOf(testDb.db, me.email), id, expenseId)
      renderExpense(id, expenseId)

      const restore = await screen.findByRole('button', { name: 'Restore' })
      expect(restore).toHaveClass('ant-btn-circle')
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    })
  })

  it('opens the edit page of this expense from Edit', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id)
    const { currentPath } = renderExpense(id, expenseId)

    await userEvent.click(await screen.findByRole('button', { name: /Edit$/ }))

    expect(currentPath()).toBe(ROUTES.editExpense(id, expenseId))
  })

  it('switches off editing a payment between members, saying "Coming soon"', async () => {
    const id = await createGroup()
    const payment = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id)
    const { currentPath } = renderExpense(id, payment)

    const edit = await screen.findByRole('button', { name: /Edit$/ })
    expect(edit).toBeDisabled()
    await userEvent.hover(edit.parentElement as HTMLElement)
    expect(await screen.findByText('Coming soon')).toBeInTheDocument()
    expect(currentPath()).toBe(ROUTES.expense(id, payment))
  })

  describe('who edited it', () => {
    it('is not written on the band, even after edits: the history says it', async () => {
      const id = await createGroup()
      const expenseId = await addExpense(id)
      const priyaId = await personIdOf(testDb.db, 'priya@gmail.com')
      await expenseService.updateExpense(testDb.db, priyaId, id, expenseId, await expenseInput(testDb.db, 'priya@gmail.com', id, { description: 'Lunch' }))
      renderExpense(id, expenseId)

      await screen.findByRole('heading', { name: 'Lunch' })
      expect(screen.queryByText(/^Edited by/)).not.toBeInTheDocument()
      expect(await screen.findByText('Priya Shah edited this expense')).toBeInTheDocument()
    })
  })

  it('goes back to the group with Back', async () => {
    const id = await createGroup()
    const expenseId = await addExpense(id)
    const { currentPath } = renderExpense(id, expenseId)

    await userEvent.click(await screen.findByRole('button', { name: 'Back' }))

    expect(currentPath()).toBe(ROUTES.group(id))
  })

  it('says "Expense not found" for an unknown expense, with a way back', async () => {
    const id = await createGroup()
    const { currentPath } = renderExpense(id, crypto.randomUUID())

    expect(await screen.findByText('Expense not found')).toBeInTheDocument()
    expectCenteredMessage(screen.getByText('Expense not found'))
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
    expectCenteredMessage(screen.getByText("Couldn't load this expense"))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Beach shack dinner' })).toBeInTheDocument()
  })
})
