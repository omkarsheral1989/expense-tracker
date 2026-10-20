// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { expensePhotos, expenseRevisions } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { expenseService } from '../../../services/expenseService'
import { photoService } from '../../../services/photoService'
import type { ReceiptInput } from '../../../services/photoService/types.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { EditExpensePage } from '../index.tsx'

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

const photo = (name: string, type = 'image/jpeg') => new File([`picture ${name}`], name, { type })
const chooser = () => screen.getByTestId('receipt-chooser') as HTMLInputElement
const removeButtons = () => screen.queryAllByRole('button', { name: /^Remove receipt photo/ })
const saveButton = () => screen.getByRole('button', { name: 'Save' })
const store = () => photoService.open(me.id)

async function createGroup() {
  const result = await createTestGroup(testDb.db, me, {
    name: 'Goa trip',
    type: 'trip',
    defaultCurrency: 'GBP',
    memberEmails: ['priya@gmail.com'],
  })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.groupId
}

/** An expense whose photos are really on the device, as the add page would have saved them. */
async function addExpenseWithPhotos(groupId: string, files: File[]) {
  const receipts = await photoService.storeReceipts(store(), files)
  const expenseId = await addTestExpense(testDb.db, me.email, groupId, {
    description: 'Dinner',
    category: 'food.dining_out',
    amountMinor: 900,
    date: '2026-10-05',
    receipts,
  })
  return { expenseId, receipts }
}

function renderEdit(groupId: string, expenseId: string) {
  return renderPage(<EditExpensePage />, {
    path: ROUTES.editExpense(groupId, expenseId),
    pattern: ROUTES.editExpensePattern,
    routes: [ROUTES.expensePattern, ROUTES.groupPattern],
  })
}

/** Which photos the expense has now, in order, as the details page would list them. */
async function livePhotoIds(groupId: string, expenseId: string) {
  const details = await expenseService.getExpense(testDb.db, await personIdOf(testDb.db, me.email), groupId, expenseId)
  return details?.receipts.map((receipt) => receipt.id) ?? []
}

describe('EditExpensePage: receipt photos', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 20, 12, 0))
    user = userEvent.setup()
    useAuthStore.setState({ profile: me, token: null })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.mocked(getDb).mockClear()
  })

  /** Opens the edit page and waits for the form. */
  async function open(groupId: string, expenseId: string) {
    const page = renderEdit(groupId, expenseId)
    await screen.findByRole('heading', { name: 'Edit expense' })
    return page
  }

  async function saveAndWaitForDetails(page: ReturnType<typeof renderEdit>, groupId: string, expenseId: string) {
    await user.click(saveButton())
    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.expense(groupId, expenseId)))
  }

  it('shows the photos the expense already has, as pictures, before any new ones', async () => {
    const groupId = await createGroup()
    const { expenseId } = await addExpenseWithPhotos(groupId, [photo('a.jpg'), photo('b.jpg')])
    await open(groupId, expenseId)

    const first = await screen.findByRole('img', { name: 'Receipt photo 1' })
    expect(first).toHaveAttribute('src', expect.stringMatching(/^blob:/))
    expect(await screen.findByRole('img', { name: 'Receipt photo 2' })).toBeInTheDocument()

    await user.upload(chooser(), photo('c.jpg'))

    expect(removeButtons()).toHaveLength(3)
    expect(await screen.findByRole('img', { name: 'Receipt photo 3' })).toBeInTheDocument()
  })

  it('keeps the original photos when more are added', async () => {
    const groupId = await createGroup()
    const { expenseId, receipts } = await addExpenseWithPhotos(groupId, [photo('a.jpg')])
    const page = await open(groupId, expenseId)
    await screen.findByRole('img', { name: 'Receipt photo 1' })

    await user.upload(chooser(), [photo('b.jpg'), photo('c.jpg')])
    await saveAndWaitForDetails(page, groupId, expenseId)

    const ids = await livePhotoIds(groupId, expenseId)
    expect(ids).toHaveLength(3)
    expect(ids[0]).toBe(receipts[0].id)
    // Every photo, the original and the new ones, is on the device with its thumbnail.
    for (const id of ids) {
      expect(await store().getPhoto(id)).not.toBeNull()
      expect(await store().getThumbnail(id)).not.toBeNull()
    }
    expect(await (await store().getPhoto(ids[0]))?.text()).toBe('picture a.jpg')
    expect(await (await store().getPhoto(ids[2]))?.text()).toBe('picture c.jpg')
  })

  it('keeps the photos when only the text is edited', async () => {
    const groupId = await createGroup()
    const { expenseId, receipts } = await addExpenseWithPhotos(groupId, [photo('a.jpg'), photo('b.jpg')])
    const page = await open(groupId, expenseId)
    const description = screen.getByRole('textbox', { name: 'Description' })

    await user.clear(description)
    await user.type(description, 'Lunch')
    await saveAndWaitForDetails(page, groupId, expenseId)

    expect(await livePhotoIds(groupId, expenseId)).toEqual(receipts.map((receipt) => receipt.id))
    const deleted = await testDb.db.select().from(expensePhotos).where(eq(expensePhotos.expenseId, expenseId))
    expect(deleted.every((row) => row.deletedAt === null)).toBe(true)
    // Nothing about the photos changed, so the history does not mention them.
    const [revision] = await testDb.db.select().from(expenseRevisions)
    expect(revision.changes.map((change) => change.field)).toEqual(['description'])
  })

  it('takes an original photo off but keeps its picture on the device, and adds the new one after the rest', async () => {
    const groupId = await createGroup()
    const { expenseId, receipts } = await addExpenseWithPhotos(groupId, [photo('a.jpg'), photo('b.jpg')])
    const page = await open(groupId, expenseId)
    await screen.findByRole('img', { name: 'Receipt photo 2' })

    await user.click(screen.getByRole('button', { name: /Remove receipt photo 1$/ }))
    expect(removeButtons()).toHaveLength(1)
    await user.upload(chooser(), photo('c.jpg'))
    await saveAndWaitForDetails(page, groupId, expenseId)

    const ids = await livePhotoIds(groupId, expenseId)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(receipts[1].id)
    const [removed] = await testDb.db.select().from(expensePhotos).where(eq(expensePhotos.id, receipts[0].id))
    expect(removed.deletedAt).not.toBeNull()
    // The picture stays, so an earlier version of the expense can still show it.
    expect(await (await store().getPhoto(receipts[0].id))?.text()).toBe('picture a.jpg')
  })

  it('goes through several edits of the same expense, each keeping what it should', async () => {
    const groupId = await createGroup()
    const { expenseId, receipts } = await addExpenseWithPhotos(groupId, [photo('a.jpg')])
    const [a] = receipts

    // Edit 1: add a photo.
    let page = await open(groupId, expenseId)
    await screen.findByRole('img', { name: 'Receipt photo 1' })
    await user.upload(chooser(), photo('b.jpg'))
    await saveAndWaitForDetails(page, groupId, expenseId)
    const afterFirst = await livePhotoIds(groupId, expenseId)
    expect(afterFirst).toHaveLength(2)
    expect(afterFirst[0]).toBe(a.id)
    const b = afterFirst[1]
    cleanup()

    // Edit 2: add another, with the text changed too.
    page = await open(groupId, expenseId)
    await screen.findByRole('img', { name: 'Receipt photo 2' })
    expect(removeButtons()).toHaveLength(2)
    await user.type(screen.getByRole('textbox', { name: 'Notes' }), 'Cash')
    await user.upload(chooser(), photo('c.jpg'))
    await saveAndWaitForDetails(page, groupId, expenseId)
    const afterSecond = await livePhotoIds(groupId, expenseId)
    expect(afterSecond).toHaveLength(3)
    expect(afterSecond.slice(0, 2)).toEqual([a.id, b])
    const c = afterSecond[2]
    cleanup()

    // Edit 3: take the first off.
    page = await open(groupId, expenseId)
    await screen.findByRole('img', { name: 'Receipt photo 3' })
    expect(removeButtons()).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: /Remove receipt photo 1$/ }))
    await saveAndWaitForDetails(page, groupId, expenseId)
    expect(await livePhotoIds(groupId, expenseId)).toEqual([b, c])
    cleanup()

    // Opened once more, the two left are still there.
    await open(groupId, expenseId)
    await screen.findByRole('img', { name: 'Receipt photo 2' })
    expect(removeButtons()).toHaveLength(2)

    const revisions = await testDb.db.select().from(expenseRevisions).orderBy(asc(expenseRevisions.editedAt))
    expect(revisions.map((revision) => revision.before.photos.map((row) => row.id))).toEqual([[a.id], [a.id, b], [a.id, b, c]])
    expect(revisions.map((revision) => revision.changes.map((change) => change.field))).toEqual([
      ['receipts'],
      ['notes', 'receipts'],
      ['receipts'],
    ])
    // Every picture ever added is still on the device.
    for (const id of [a.id, b, c]) expect(await store().getPhoto(id)).not.toBeNull()
    const live = await testDb.db
      .select()
      .from(expensePhotos)
      .where(and(eq(expensePhotos.expenseId, expenseId), isNull(expensePhotos.deletedAt)))
      .orderBy(asc(expensePhotos.position))
    expect(live.map((row) => [row.id, row.position])).toEqual([[b, 0], [c, 1]])
  })

  it('leaves the original photos alone and takes only the new ones off the device when the edit is refused', async () => {
    const groupId = await createGroup()
    const { expenseId, receipts } = await addExpenseWithPhotos(groupId, [photo('a.jpg')])
    await open(groupId, expenseId)
    await screen.findByRole('img', { name: 'Receipt photo 1' })
    await user.upload(chooser(), photo('b.jpg'))
    await user.clear(screen.getByRole('textbox', { name: 'Description' }))
    const removeReceipts = vi.spyOn(photoService, 'removeReceipts')

    await user.click(saveButton())

    await screen.findByText('Enter a description.')
    await waitFor(() => expect(removeReceipts).toHaveBeenCalledTimes(1))
    const [, removedIds] = removeReceipts.mock.calls[0]
    expect(removedIds).toHaveLength(1)
    expect(removedIds).not.toContain(receipts[0].id)
    expect(await store().getPhoto(removedIds[0])).toBeNull()
    expect(await store().getPhoto(receipts[0].id)).not.toBeNull()
    expect(await livePhotoIds(groupId, expenseId)).toEqual([receipts[0].id])
    expect(await testDb.db.select().from(expenseRevisions)).toEqual([])
    // The form still shows both photos, so the user can fix the description and try again.
    expect(removeButtons()).toHaveLength(2)
  })

  it('leaves the original photos alone when saving fails unexpectedly', async () => {
    const groupId = await createGroup()
    const { expenseId, receipts } = await addExpenseWithPhotos(groupId, [photo('a.jpg')])
    await open(groupId, expenseId)
    await screen.findByRole('img', { name: 'Receipt photo 1' })
    await user.upload(chooser(), photo('b.jpg'))
    vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))

    await user.click(saveButton())

    expect(await screen.findByText("Couldn't save the changes. Please try again.")).toBeInTheDocument()
    expect(await store().getPhoto(receipts[0].id)).not.toBeNull()
    expect(await livePhotoIds(groupId, expenseId)).toEqual([receipts[0].id])
  })

  it('counts the photos it already has towards the limit of 10', async () => {
    const groupId = await createGroup()
    const { expenseId } = await addExpenseWithPhotos(
      groupId,
      Array.from({ length: 9 }, (_, index) => photo(`${index}.jpg`)),
    )
    await open(groupId, expenseId)
    await waitFor(() => expect(removeButtons()).toHaveLength(9))

    await user.upload(chooser(), [photo('x.jpg'), photo('y.jpg')])

    expect(await screen.findByText('An expense can have up to 10 photos.')).toBeInTheDocument()
    expect(removeButtons()).toHaveLength(10)
    expect(screen.getByRole('button', { name: /Add receipt photos$/ })).toBeDisabled()
  })

  it('can take off, and keeps, a photo that is not on this device', async () => {
    const groupId = await createGroup()
    const missing: ReceiptInput = { id: crypto.randomUUID(), mimeType: 'image/jpeg', sizeBytes: 10 }
    const expenseId = await addTestExpense(testDb.db, me.email, groupId, {
      description: 'Dinner',
      category: 'food.dining_out',
      amountMinor: 900,
      date: '2026-10-05',
      receipts: [missing],
    })
    const page = await open(groupId, expenseId)
    await waitFor(() => expect(removeButtons()).toHaveLength(1))

    // Adding another photo keeps the missing one.
    await user.upload(chooser(), photo('b.jpg'))
    await saveAndWaitForDetails(page, groupId, expenseId)
    const ids = await livePhotoIds(groupId, expenseId)
    expect(ids[0]).toBe(missing.id)
    expect(ids).toHaveLength(2)
    cleanup()

    // And it can be taken off.
    const second = await open(groupId, expenseId)
    await waitFor(() => expect(removeButtons()).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: /Remove receipt photo 1$/ }))
    await saveAndWaitForDetails(second, groupId, expenseId)
    expect(await livePhotoIds(groupId, expenseId)).toEqual([ids[1]])
  })

  it('writes nothing and keeps the photos when nothing was changed', async () => {
    const groupId = await createGroup()
    const { expenseId, receipts } = await addExpenseWithPhotos(groupId, [photo('a.jpg'), photo('b.jpg')])
    const page = await open(groupId, expenseId)
    await screen.findByRole('img', { name: 'Receipt photo 2' })

    await saveAndWaitForDetails(page, groupId, expenseId)

    expect(await livePhotoIds(groupId, expenseId)).toEqual(receipts.map((receipt) => receipt.id))
    expect(await testDb.db.select().from(expenseRevisions)).toEqual([])
    expect(screen.queryByText('Expense updated.')).not.toBeInTheDocument()
  })

  it('leaves at once while nothing was changed', async () => {
    const groupId = await createGroup()
    const { expenseId } = await addExpenseWithPhotos(groupId, [photo('a.jpg'), photo('b.jpg')])
    const page = await open(groupId, expenseId)
    await screen.findByRole('img', { name: 'Receipt photo 2' })

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(page.currentPath()).toBe(ROUTES.expense(groupId, expenseId))
  })

  it('asks "Discard your changes?" after a photo was taken off', async () => {
    const groupId = await createGroup()
    const { expenseId } = await addExpenseWithPhotos(groupId, [photo('a.jpg'), photo('b.jpg')])
    const page = await open(groupId, expenseId)
    await screen.findByRole('img', { name: 'Receipt photo 2' })

    await user.click(screen.getByRole('button', { name: /Remove receipt photo 2$/ }))
    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(await screen.findByRole('dialog', { name: 'Discard your changes?' })).toBeInTheDocument()
    expect(page.currentPath()).toBe(ROUTES.editExpense(groupId, expenseId))
  })
})
