// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { expenses, groupMembers } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { expenseService } from '../../../services/expenseService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { fromElsewhere } from '../../../testing/changes.ts'
import { personIdOf } from '../../../testing/expenses.ts'
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

const restoreButton = () => screen.getByRole('button', { name: named('Restore this version') })
async function storedExpense(expenseId: string) {
  const [row] = await testDb.db.select().from(expenses).where(eq(expenses.id, expenseId))
  return row
}

describe('ExpenseVersionPage: restoring a version', () => {
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

  /** "Beach shack dinner" 9.00 added at 12:00, edited at 2:30 pm to "Lunch" 12.00 without notes. */
  async function editedExpense() {
    const groupId = await createGroup()
    const expenseId = await addExpense(groupId)
    await editAt(me.email, groupId, expenseId, 14, 30, { description: 'Lunch', amountMinor: 1200, notes: '' })
    const [added, edited] = await eventsOf(expenseId)
    return { groupId, expenseId, added, edited }
  }

  it('puts the expense back, with no question, says so with the time of that version, and opens the expense', async () => {
    const { groupId, expenseId, added } = await editedExpense()
    vi.setSystemTime(new Date(2026, 9, 21, 17, 15))
    const page = renderVersion(groupId, expenseId, added.id)
    await screen.findByRole('heading', { name: 'Beach shack dinner' })

    await user.click(restoreButton())

    expect(await screen.findByText(/^Expense restored to the version from 21 Oct 2026, 12:00\s?PM\.$/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.expense(groupId, expenseId)))
    const stored = await storedExpense(expenseId)
    expect(stored).toMatchObject({ description: 'Beach shack dinner', amountMinor: 900, notes: 'Card', updatedBy: await personIdOf(testDb.db, me.email) })
    expect(stored.updatedAt).toEqual(new Date(2026, 9, 21, 17, 15))
  })

  it('records one "reverted" event that names the version it went back to and what changed back', async () => {
    const { groupId, expenseId, added } = await editedExpense()
    vi.setSystemTime(new Date(2026, 9, 21, 17, 15))
    renderVersion(groupId, expenseId, added.id)
    await screen.findByRole('heading', { name: 'Beach shack dinner' })

    await user.click(restoreButton())

    await screen.findByText(/^Expense restored to the version/)
    const events = await eventsOf(expenseId)
    expect(events.map((event) => event.kind)).toEqual(['added', 'edited', 'reverted'])
    expect(events[2]).toMatchObject({ restoredFrom: added.id, occurredAt: new Date(2026, 9, 21, 17, 15) })
    expect(events[2].changes.map((change) => change.field)).toEqual(['description', 'amount', 'notes'])
  })

  it('shows the busy button until it is done, and changes nothing before', async () => {
    const { groupId, expenseId, added } = await editedExpense()
    let finish: (() => void) | undefined
    const real = expenseService.restoreVersion
    vi.spyOn(expenseService, 'restoreVersion').mockImplementation(
      (...args) => new Promise((resolve) => { finish = () => resolve(real(...args)) }),
    )
    const page = renderVersion(groupId, expenseId, added.id)
    await screen.findByRole('heading', { name: 'Beach shack dinner' })

    await user.click(restoreButton())

    await waitFor(() => expect(finish).toBeDefined())
    expect(restoreButton()).toHaveClass('ant-btn-loading')
    expect(page.currentPath()).toBe(ROUTES.expenseVersion(groupId, expenseId, added.id))
    expect((await storedExpense(expenseId)).description).toBe('Lunch')

    finish?.()
    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.expense(groupId, expenseId)))
  })

  it('says so and changes nothing when it fails, and stays on the page', async () => {
    const { groupId, expenseId, added } = await editedExpense()
    const page = renderVersion(groupId, expenseId, added.id)
    await screen.findByRole('heading', { name: 'Beach shack dinner' })
    vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))

    await user.click(restoreButton())

    expect(await screen.findByText("Couldn't restore the version. Please try again.")).toBeInTheDocument()
    expect(page.currentPath()).toBe(ROUTES.expenseVersion(groupId, expenseId, added.id))
    expect(restoreButton()).not.toHaveClass('ant-btn-loading')
    expect((await storedExpense(expenseId)).description).toBe('Lunch')
    expect((await eventsOf(expenseId)).map((event) => event.kind)).toEqual(['added', 'edited'])
  })

  it('says it is already the current version, and loses the button, when the expense was put back meanwhile', async () => {
    const { groupId, expenseId, added } = await editedExpense()
    const page = renderVersion(groupId, expenseId, added.id)
    await screen.findByRole('heading', { name: 'Beach shack dinner' })
    // Someone else put it back to this version a moment ago.
    await fromElsewhere(async () => expenseService.restoreVersion(testDb.db, await personIdOf(testDb.db, 'priya@gmail.com'), groupId, expenseId, added.id))

    await user.click(restoreButton())

    expect(await screen.findByText('This version is already the current one.')).toBeInTheDocument()
    expect(await screen.findByText('This is the current version.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: named('Restore this version') })).not.toBeInTheDocument()
    expect(page.currentPath()).toBe(ROUTES.expenseVersion(groupId, expenseId, added.id))
    expect((await eventsOf(expenseId)).filter((event) => event.kind === 'reverted')).toHaveLength(1)
  })

  it('says to restore the expense first, and loses the button, when it was deleted meanwhile', async () => {
    const { groupId, expenseId, added } = await editedExpense()
    const page = renderVersion(groupId, expenseId, added.id)
    await screen.findByRole('heading', { name: 'Beach shack dinner' })
    await expenseService.deleteExpense(testDb.db, await personIdOf(testDb.db, 'priya@gmail.com'), groupId, expenseId)

    await user.click(restoreButton())

    expect(await screen.findAllByText('Restore the expense first to restore a version.')).not.toHaveLength(0)
    expect(screen.queryByRole('button', { name: named('Restore this version') })).not.toBeInTheDocument()
    expect(page.currentPath()).toBe(ROUTES.expenseVersion(groupId, expenseId, added.id))
    expect((await storedExpense(expenseId)).description).toBe('Lunch')
  })

  it('says it is no longer available, and opens the group, when the user left the group meanwhile', async () => {
    const { groupId, expenseId, added } = await editedExpense()
    const page = renderVersion(groupId, expenseId, added.id)
    await screen.findByRole('heading', { name: 'Beach shack dinner' })
    await testDb.db
      .update(groupMembers)
      .set({ deletedAt: new Date() })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.personId, await personIdOf(testDb.db, me.email))))

    await user.click(restoreButton())

    expect(await screen.findByText('This version is no longer available.')).toBeInTheDocument()
    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(groupId)))
    expect((await storedExpense(expenseId)).description).toBe('Lunch')
  })

  it('can be undone the same way: the version it replaced is in the history and can be put back', async () => {
    const { groupId, expenseId, added, edited } = await editedExpense()
    const first = renderVersion(groupId, expenseId, added.id)
    await screen.findByRole('heading', { name: 'Beach shack dinner' })
    await user.click(restoreButton())
    await waitFor(() => expect(first.currentPath()).toBe(ROUTES.expense(groupId, expenseId)))
    cleanup()
    vi.setSystemTime(new Date(2026, 9, 21, 18, 0))

    const second = renderVersion(groupId, expenseId, edited.id)
    await screen.findByRole('heading', { name: 'Lunch' })
    // The edit's version is not the current one now, so it can be put back.
    await user.click(restoreButton())

    await waitFor(() => expect(second.currentPath()).toBe(ROUTES.expense(groupId, expenseId)))
    expect(await storedExpense(expenseId)).toMatchObject({ description: 'Lunch', amountMinor: 1200 })
    expect((await eventsOf(expenseId)).map((event) => event.kind)).toEqual(['added', 'edited', 'reverted', 'reverted'])
  })

  it('changes what people owe when the amount of the version comes back', async () => {
    const { groupId, expenseId, added } = await editedExpense()
    const meId = await personIdOf(testDb.db, me.email)
    const owed = async () => (await expenseService.groupBalances(testDb.db, meId, groupId)).map((balance) => balance.amountMinor)
    expect(await owed()).toEqual([400, 400])
    renderVersion(groupId, expenseId, added.id)
    await screen.findByRole('heading', { name: 'Beach shack dinner' })

    await user.click(restoreButton())

    await waitFor(async () => expect(await owed()).toEqual([300, 300]))
    expect(within(document.body).queryByText('This is the current version.')).not.toBeInTheDocument()
  })
})
