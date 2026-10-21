// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { groupMembers } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { expenseService } from '../../../services/expenseService'
import { photoService } from '../../../services/photoService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { expectCenteredMessage } from '../../../testing/centered.ts'
import { addTestSettlement, personIdOf } from '../../../testing/expenses.ts'
import { me, named, setUpVersionTests } from './helpers.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const { testDb, createGroup, addExpense, editAt, eventsOf, renderVersion } = setUpVersionTests()

const restoreButton = () => screen.queryByRole('button', { name: named('Restore this version') })

describe('ExpenseVersionPage', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 21, 12, 0))
    user = userEvent.setup()
    useAuthStore.setState({ profile: me, token: null })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.mocked(getDb).mockClear()
  })

  /** An expense edited once: 9.00 "Beach shack dinner", then (at 2:30 pm) 12.00 "Lunch". Returns its events. */
  async function editedExpense() {
    const groupId = await createGroup()
    const expenseId = await addExpense(groupId)
    await editAt(me.email, groupId, expenseId, 14, 30, { description: 'Lunch', amountMinor: 1200, notes: '' })
    const [added, edited] = await eventsOf(expenseId)
    return { groupId, expenseId, added, edited }
  }

  describe('the page', () => {
    it('shows the expense as it was right after an event: title, amount, category and day, who paid, split, notes', async () => {
      const { groupId, expenseId, added } = await editedExpense()
      renderVersion(groupId, expenseId, added.id)

      expect(await screen.findByRole('heading', { name: 'Beach shack dinner' })).toBeInTheDocument()
      expect(screen.getByText('£9.00')).toBeInTheDocument()
      expect(screen.getByText('Dining out · Mon, 5 Oct 2026')).toBeInTheDocument()
      expect(screen.getByText('You paid £9.00')).toBeInTheDocument()
      expect(screen.getByText('Split equally')).toBeInTheDocument()
      expect(screen.getByText('You owe £3.00')).toBeInTheDocument()
      expect(screen.getByText('Priya Shah owes £3.00')).toBeInTheDocument()
      expect(screen.getByText('Card')).toBeInTheDocument()
    })

    it('shows the later version with its own values', async () => {
      const { groupId, expenseId, edited } = await editedExpense()
      renderVersion(groupId, expenseId, edited.id)

      expect(await screen.findByRole('heading', { name: 'Lunch' })).toBeInTheDocument()
      expect(screen.getByText('£12.00')).toBeInTheDocument()
      expect(screen.getByText('You owe £4.00')).toBeInTheDocument()
      // The notes were taken off in that edit.
      expect(screen.queryByText('Card')).not.toBeInTheDocument()
      expect(screen.queryByText('Notes')).not.toBeInTheDocument()
    })

    it('has Back to the expense, the title "Version" and the tab title with the expense\'s name then', async () => {
      const { groupId, expenseId, added } = await editedExpense()
      const page = renderVersion(groupId, expenseId, added.id)

      expect(await screen.findByRole('heading', { name: 'Version' })).toBeInTheDocument()
      await waitFor(() => expect(document.title).toBe('Version of Beach shack dinner · OwnLedger'))
      await user.click(screen.getByRole('button', { name: 'Back' }))
      expect(page.currentPath()).toBe(ROUTES.expense(groupId, expenseId))
    })

    it('says what the entry is and, for an edit, what it changed, in the words of the history', async () => {
      const { groupId, expenseId, edited } = await editedExpense()
      renderVersion(groupId, expenseId, edited.id)

      expect(await screen.findByText('You edited this expense')).toBeInTheDocument()
      expect(screen.getByText(/· 21 Oct 2026, 2:30\s?PM/)).toBeInTheDocument()
      const lines = screen.getAllByRole('listitem').map((line) => line.textContent)
      expect(lines).toEqual(
        expect.arrayContaining([
          "Description changed from 'Beach shack dinner' to 'Lunch'",
          'Cost changed from £9.00 to £12.00',
          "Notes removed (were 'Card')",
        ]),
      )
    })

    it('does not show what belongs to the expense: who added or edited it, or its history', async () => {
      const { groupId, expenseId, edited } = await editedExpense()
      renderVersion(groupId, expenseId, edited.id)

      await screen.findByRole('heading', { name: 'Lunch' })
      expect(screen.queryByText(/^Added by/)).not.toBeInTheDocument()
      expect(screen.queryByText(/^Edited by/)).not.toBeInTheDocument()
      expect(screen.queryByText('History')).not.toBeInTheDocument()
    })

    it.each([
      ['added', "You added this expense"],
      ['edited', 'You edited this expense'],
    ] as const)('opens the "%s" entry', async (kind, header) => {
      const { groupId, expenseId } = await editedExpense()
      const event = (await eventsOf(expenseId)).find((one) => one.kind === kind)!
      renderVersion(groupId, expenseId, event.id)

      expect(await screen.findByText(header)).toBeInTheDocument()
    })

    it('opens the deleted, restored and reverted entries too, each worded as in the history', async () => {
      const { groupId, expenseId, added } = await editedExpense()
      const meId = await personIdOf(testDb.db, me.email)
      vi.setSystemTime(new Date(2026, 9, 21, 15, 0))
      await expenseService.deleteExpense(testDb.db, meId, groupId, expenseId)
      vi.setSystemTime(new Date(2026, 9, 21, 16, 0))
      await expenseService.restoreExpense(testDb.db, meId, groupId, expenseId)
      vi.setSystemTime(new Date(2026, 9, 21, 17, 0))
      await expenseService.restoreVersion(testDb.db, meId, groupId, expenseId, added.id)
      const events = await eventsOf(expenseId)
      const text = async (kind: string, header: RegExp) => {
        renderVersion(groupId, expenseId, events.find((event) => event.kind === kind)!.id)
        expect(await screen.findByText(header)).toBeInTheDocument()
        cleanup()
      }

      await text('deleted', /^You deleted this expense$/)
      await text('restored', /^You restored this expense$/)
      await text('reverted', /^You restored the version from 21 Oct 2026, 12:00\s?PM$/)
    })

    it('names someone else who did it, by name', async () => {
      const groupId = await createGroup()
      const expenseId = await addExpense(groupId)
      await editAt('priya@gmail.com', groupId, expenseId, 14, 0, { description: 'Lunch' })
      const [, edited] = await eventsOf(expenseId)
      renderVersion(groupId, expenseId, edited.id)

      expect(await screen.findByText('Priya Shah edited this expense')).toBeInTheDocument()
    })
  })

  describe('the receipts', () => {
    it('shows the photos the expense had then, as thumbnails, and a grey square for one not on this device', async () => {
      const groupId = await createGroup()
      const store = photoService.open(me.id)
      const receipts = await photoService.storeReceipts(store, [new File(['first'], 'a.jpg', { type: 'image/jpeg' })])
      const missing = { id: crypto.randomUUID(), mimeType: 'image/jpeg', sizeBytes: 10 }
      const expenseId = await addExpense(groupId, { receipts: [...receipts, missing] })
      await editAt(me.email, groupId, expenseId, 14, 0, { receipts: [] })
      const [added] = await eventsOf(expenseId)

      renderVersion(groupId, expenseId, added.id)

      expect(await screen.findByText('Receipts')).toBeInTheDocument()
      const gallery = screen.getByRole('list', { name: 'Receipt photos' })
      expect(await within(gallery).findByRole('img', { name: 'Receipt photo 1' })).toHaveAttribute('src', expect.stringMatching(/^blob:/))
      expect(await within(gallery).findByRole('img', { name: 'Receipt photo 2, not on this device' })).toBeInTheDocument()
    })

    it('has no receipts section for a version without photos', async () => {
      const { groupId, expenseId, added } = await editedExpense()
      renderVersion(groupId, expenseId, added.id)

      await screen.findByRole('heading', { name: 'Beach shack dinner' })
      expect(screen.queryByText('Receipts')).not.toBeInTheDocument()
    })
  })

  describe('the Restore this version button', () => {
    it('is on an earlier version of a live expense', async () => {
      const { groupId, expenseId, added } = await editedExpense()
      renderVersion(groupId, expenseId, added.id)

      await screen.findByRole('heading', { name: 'Beach shack dinner' })
      expect(restoreButton()).toBeEnabled()
      expect(screen.queryByText('This is the current version.')).not.toBeInTheDocument()
    })

    it('is missing on the current version, which says so', async () => {
      const { groupId, expenseId, edited } = await editedExpense()
      renderVersion(groupId, expenseId, edited.id)

      expect(await screen.findByText('This is the current version.')).toBeInTheDocument()
      expect(restoreButton()).not.toBeInTheDocument()
    })

    it('is missing on a version equal to the current one, even an older entry', async () => {
      const { groupId, expenseId } = await editedExpense()
      const meId = await personIdOf(testDb.db, me.email)
      await expenseService.deleteExpense(testDb.db, meId, groupId, expenseId)
      await expenseService.restoreExpense(testDb.db, meId, groupId, expenseId)
      const events = await eventsOf(expenseId)
      // The deleted and restored entries hold the same expense as the last edit, so each is the current version.
      renderVersion(groupId, expenseId, events.find((event) => event.kind === 'restored')!.id)

      expect(await screen.findByText('This is the current version.')).toBeInTheDocument()
      expect(restoreButton()).not.toBeInTheDocument()
    })

    it('is missing on an expense that is deleted, which says to restore the expense first, and the version still opens', async () => {
      const { groupId, expenseId, added } = await editedExpense()
      await expenseService.deleteExpense(testDb.db, await personIdOf(testDb.db, me.email), groupId, expenseId)
      renderVersion(groupId, expenseId, added.id)

      expect(await screen.findByText('Restore the expense first to restore a version.')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Beach shack dinner' })).toBeInTheDocument()
      expect(restoreButton()).not.toBeInTheDocument()
    })

    it('is missing on a payment between members, with no note either', async () => {
      const groupId = await createGroup()
      const payment = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', groupId)
      const [added] = await eventsOf(payment)
      renderVersion(groupId, payment, added.id)

      expect(await screen.findByRole('heading', { name: 'You paid Priya' })).toBeInTheDocument()
      expect(screen.getByText('£10.00')).toBeInTheDocument()
      expect(restoreButton()).not.toBeInTheDocument()
      expect(screen.queryByText(/^Restore the expense first/)).not.toBeInTheDocument()
      expect(screen.queryByText('Split equally')).not.toBeInTheDocument()
    })
  })

  describe('the other states', () => {
    it('shows grey placeholders while the version loads', async () => {
      const { groupId, expenseId, added } = await editedExpense()
      vi.mocked(getDb).mockImplementationOnce(() => new Promise(() => {}))
      renderVersion(groupId, expenseId, added.id)

      expect(screen.getByRole('status', { name: 'Loading the version' })).toBeInTheDocument()
    })

    it('says so when it cannot be loaded, and loads it on "Try again"', async () => {
      const { groupId, expenseId, added } = await editedExpense()
      vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))
      renderVersion(groupId, expenseId, added.id)

      expect(await screen.findByText("Couldn't load this version")).toBeInTheDocument()
      expectCenteredMessage(screen.getByText("Couldn't load this version"))
      await user.click(screen.getByRole('button', { name: 'Try again' }))
      expect(await screen.findByRole('heading', { name: 'Beach shack dinner' })).toBeInTheDocument()
    })

    async function expectNotFound(groupId: string, expenseId: string, page: ReturnType<typeof renderVersion>) {
      expect(await screen.findByText('Version not found')).toBeInTheDocument()
      expect(screen.getByText('It may have been removed, or you may not be a member of its group.')).toBeInTheDocument()
      expectCenteredMessage(screen.getByText('Version not found'))
      await waitFor(() => expect(document.title).toBe('Version not found · OwnLedger'))
      await user.click(screen.getByRole('button', { name: 'Back to the expense' }))
      expect(page.currentPath()).toBe(ROUTES.expense(groupId, expenseId))
    }

    it('says "Version not found" for an unknown version', async () => {
      const { groupId, expenseId } = await editedExpense()
      await expectNotFound(groupId, expenseId, renderVersion(groupId, expenseId, crypto.randomUUID()))
    })

    it("says \"Version not found\" for another expense's version", async () => {
      const { groupId, expenseId } = await editedExpense()
      const other = await addExpense(groupId, { description: 'Other' })
      const [otherAdded] = await eventsOf(other)
      await expectNotFound(groupId, expenseId, renderVersion(groupId, expenseId, otherAdded.id))
    })

    it('says "Version not found" for a group the user is not in', async () => {
      const { groupId, expenseId, added } = await editedExpense()
      await testDb.db.update(groupMembers).set({ deletedAt: new Date() }).where(eq(groupMembers.personId, await personIdOf(testDb.db, me.email)))
      await expectNotFound(groupId, expenseId, renderVersion(groupId, expenseId, added.id))
    })
  })
})
