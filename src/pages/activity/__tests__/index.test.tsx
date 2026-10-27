// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expenseEvents, syncStatus } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { activityService } from '../../../services/activityService'
import { expenseService } from '../../../services/expenseService'
import { addTestExpense, addTestSettlement, expenseInput, personIdOf } from '../../../testing/expenses.ts'
import { stubIntersectionObserver } from '../../../testing/intersectionObserver.ts'
import { renderPage } from '../../../testing/render.tsx'
import { ActivityPage } from '../index.tsx'
import { useLocation, useNavigate } from 'react-router'
import { me, priya, renderActivity, rows, setUpActivityTests } from './helpers.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const { testDb, createGroup, addArrivedExpense } = setUpActivityTests()

/** Lets the clock move on, since events are ordered by time. */
const pause = () => new Promise((resolve) => setTimeout(resolve, 5))

beforeEach(async () => {
  await createGroup()
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  // Leaving the page marks it seen a moment later; let that finish before the next test empties the database.
  await new Promise((resolve) => setTimeout(resolve, 30))
})

describe('the Activity page while it loads', () => {
  it('shows the spinner with its label in a column that fills the page, under the header', () => {
    renderActivity()

    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument()
    const loader = screen.getByRole('status', { name: 'Loading your activity' })
    expect(loader.closest('[style*="flex-direction: column"]')).not.toBeNull()
  })
})

describe('the Activity page', () => {
  it('has a Back button to the home page, the quiet heading and a tab title', async () => {
    const page = renderActivity()

    const heading = await screen.findByRole('heading', { name: 'Activity' })
    expect(heading).toHaveStyle({ fontSize: '32px', fontWeight: '100', lineHeight: '40px', textTransform: 'uppercase' })
    await waitFor(() => expect(document.title).toBe('Activity · OwnLedger'))
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('ant-btn-variant-outlined')

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(page.currentPath()).toBe(ROUTES.home)
  })

  it('says so when there is nothing, centered in the space the page has', async () => {
    renderActivity()

    expect(await screen.findByText('No activity yet')).toBeInTheDocument()
    expect(screen.getByText('Changes to expenses in your groups will appear here.')).toBeInTheDocument()
    expect(screen.getByText('No activity yet').closest('[style*="flex: 1"]')).not.toBeNull()
  })

  it('lists the events newest first, one row each, with the sentence, group, amount and time', async () => {
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    await addTestExpense(testDb.db, me.email, groupId, { description: 'Dinner', amountMinor: 3000 })
    await pause()
    await addTestExpense(testDb.db, priya.email, groupId, { description: 'Taxi', amountMinor: 500 })
    renderActivity()

    await screen.findByRole('list', { name: 'Activity' })
    const [taxi, dinner] = rows()
    expect(within(taxi).getByText('Priya added Taxi')).toBeInTheDocument()
    expect(within(taxi).getByText('Goa trip · £5.00')).toBeInTheDocument()
    expect(within(dinner).getByText('You added Dinner')).toBeInTheDocument()
    expect(within(dinner).getByText('Goa trip · £30.00')).toBeInTheDocument()
    expect(rows()).toHaveLength(2)
    // The time is the History's date and time.
    expect(within(dinner).getByText(/\d{1,2} \w{3} 20\d\d, /)).toBeInTheDocument()
  })

  it('words each kind of event: edited, deleted, restored and restored to a version', async () => {
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    const meId = await personIdOf(testDb.db, me.email)
    const expenseId = await addTestExpense(testDb.db, me.email, groupId, { description: 'Dinner' })
    await pause()
    const [added] = await testDb.db.select().from(expenseEvents).where(eq(expenseEvents.expenseId, expenseId))
    await expenseService.updateExpense(testDb.db, meId, groupId, expenseId, await expenseInput(testDb.db, me.email, groupId, { description: 'Supper' }))
    await pause()
    await expenseService.deleteExpense(testDb.db, meId, groupId, expenseId)
    await pause()
    await expenseService.restoreExpense(testDb.db, meId, groupId, expenseId)
    await pause()
    await expenseService.restoreVersion(testDb.db, meId, groupId, expenseId, added.id)
    renderActivity()

    await screen.findByRole('list', { name: 'Activity' })
    expect(rows().map((row) => within(row).getAllByText(/^You /)[0].textContent)).toEqual([
      'You restored a version of Dinner',
      'You restored Supper',
      'You deleted Supper',
      'You edited Supper',
      'You added Dinner',
    ])
  })

  it('lists under an edit everything it changed, as the History does, and nothing under the other kinds', async () => {
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    const meId = await personIdOf(testDb.db, me.email)
    const expenseId = await addTestExpense(testDb.db, me.email, groupId, { description: 'Dinner', amountMinor: 1000 })
    await pause()
    await expenseService.updateExpense(testDb.db, meId, groupId, expenseId, await expenseInput(testDb.db, me.email, groupId, { description: 'Lunch', amountMinor: 1200 }))
    renderActivity()

    await screen.findByRole('list', { name: 'Activity' })
    const [edited, added] = rows()
    const lines = within(edited).getAllByRole('listitem').map((line) => line.textContent)
    expect(lines).toEqual(["Description changed from 'Dinner' to 'Lunch'", 'Cost changed from £10.00 to £12.00'])
    expect(within(added).queryAllByRole('listitem')).toHaveLength(0)
  })

  it('words a payment with who paid whom and the amount, and shows the group', async () => {
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    await addTestSettlement(testDb.db, priya.email, me.email, groupId, { amountMinor: 4550 })
    renderActivity()

    await screen.findByRole('list', { name: 'Activity' })
    const [payment] = rows()
    expect(within(payment).getByText('Priya added a payment: Priya paid you £45.50')).toBeInTheDocument()
    expect(within(payment).getByText('Goa trip')).toBeInTheDocument()
  })

  it('puts the actor\'s badge on the category tile of every row, the user\'s own too', async () => {
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    await addTestExpense(testDb.db, me.email, groupId, { description: 'Mine' })
    await addTestExpense(testDb.db, priya.email, groupId, { description: 'Hers' })
    renderActivity()

    await screen.findByRole('list', { name: 'Activity' })
    for (const row of rows()) {
      const tile = row.querySelector('div[role="img"]') as HTMLElement
      expect(tile).toHaveStyle({ width: '40px', height: '40px' })
      const badge = tile.parentElement!.querySelector('.ant-avatar') as HTMLElement
      expect(badge).toHaveStyle({ width: '20px', height: '20px', position: 'absolute', right: '-4px', bottom: '-4px' })
    }
    expect(within(rows()[0]).getByText('P')).toBeInTheDocument()
    expect(within(rows()[1]).getByText('O')).toBeInTheDocument()
  })

  it('makes the whole row one link to the version it holds, and the group\'s name is not a link of its own', async () => {
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    const expenseId = await addTestExpense(testDb.db, me.email, groupId, { description: 'Dinner' })
    const [added] = await testDb.db.select().from(expenseEvents)
    const page = renderActivity()

    await screen.findByRole('list', { name: 'Activity' })
    const row = rows()[0]
    const link = within(row).getByRole('link')
    expect(link).toHaveAttribute('href', `/groups/${groupId}/expenses/${expenseId}/versions/${added.id}`)
    expect(within(row).getAllByRole('link')).toHaveLength(1)
    expect(within(row).getByText('Goa trip · £10.00').closest('a')).toBe(link)

    await userEvent.click(link)
    expect(page.currentPath()).toBe(ROUTES.expenseVersion(groupId, expenseId, added.id))
  })

  it('hands the version page where it came from, so its Back arrow returns here', async () => {
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    await addTestExpense(testDb.db, me.email, groupId, { description: 'Dinner' })
    function ShowState() {
      return <p>{JSON.stringify(useLocation().state)}</p>
    }
    renderPage(<ActivityPage />, {
      path: ROUTES.activity,
      extra: [{ path: ROUTES.expenseVersionPattern, element: <ShowState /> }],
    })
    await screen.findByRole('list', { name: 'Activity' })

    await userEvent.click(within(rows()[0]).getByRole('link'))

    expect(await screen.findByText('{"from":"activity"}')).toBeInTheDocument()
  })

  it('shows a deleted expense\'s row, which opens as any other', async () => {
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    const meId = await personIdOf(testDb.db, me.email)
    const expenseId = await addTestExpense(testDb.db, me.email, groupId, { description: 'Dinner' })
    await pause()
    await expenseService.deleteExpense(testDb.db, meId, groupId, expenseId)
    renderActivity()

    await screen.findByRole('list', { name: 'Activity' })
    expect(within(rows()[0]).getByText('You deleted Dinner')).toBeInTheDocument()
    expect(within(rows()[0]).getByRole('link')).toHaveAttribute('href', expect.stringContaining('/versions/'))
  })
})

describe('what is new on the Activity page', () => {
  it('highlights another member\'s event that arrived after the last time seen, with a dot, and nothing else', async () => {
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    await testDb.db.insert(syncStatus).values({ scope: 'activity-seen', lastSyncedAt: new Date('2026-10-20T10:00:00Z') })
    await addArrivedExpense(groupId, 'Old', new Date('2026-10-19T10:00:00Z'))
    await pause()
    await addArrivedExpense(groupId, 'New', new Date('2026-10-21T10:00:00Z'))
    await pause()
    await addTestExpense(testDb.db, me.email, groupId, { description: 'Mine' })
    renderActivity()

    await screen.findByRole('list', { name: 'Activity' })
    const [mine, fresh, old] = rows()
    expect(within(fresh).getByTestId('unread-dot')).toBeInTheDocument()
    expect(fresh.querySelector('a')!.style.background).toContain('color-mix')
    for (const row of [mine, old]) {
      expect(within(row).queryByTestId('unread-dot')).not.toBeInTheDocument()
      expect(row.querySelector('a')!.style.background).toBe('')
    }
  })

  it('highlights everything that arrived on a first visit, but never the user\'s own events', async () => {
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    await addArrivedExpense(groupId, 'Hers', new Date('2020-01-01T00:00:00Z'))
    await pause()
    await addTestExpense(testDb.db, me.email, groupId, { description: 'Mine' })
    renderActivity()

    await screen.findByRole('list', { name: 'Activity' })
    const [mine, hers] = rows()
    expect(within(hers).getByTestId('unread-dot')).toBeInTheDocument()
    expect(within(mine).queryByTestId('unread-dot')).not.toBeInTheDocument()
  })

  it('keeps the highlights while the page is open, then marks everything seen when the user leaves', async () => {
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    await addArrivedExpense(groupId, 'Hers', new Date('2020-01-01T00:00:00Z'))
    const page = renderActivity()
    await screen.findByRole('list', { name: 'Activity' })
    expect(await testDb.db.select().from(syncStatus).where(eq(syncStatus.scope, 'activity-seen'))).toHaveLength(0)
    expect(screen.getByTestId('unread-dot')).toBeInTheDocument()

    page.unmount()

    await waitFor(async () => expect(await testDb.db.select().from(syncStatus).where(eq(syncStatus.scope, 'activity-seen'))).toHaveLength(1))
    expect((await activityService.unreadState(testDb.db, await personIdOf(testDb.db, me.email))).hasUnread).toBe(false)
  })

  it('starts clean the next visit', async () => {
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    await addArrivedExpense(groupId, 'Hers', new Date('2020-01-01T00:00:00Z'))
    renderActivity().unmount()
    await waitFor(async () => expect(await testDb.db.select().from(syncStatus)).toHaveLength(1))

    renderActivity()

    await screen.findByRole('list', { name: 'Activity' })
    expect(screen.queryByTestId('unread-dot')).not.toBeInTheDocument()
  })
})

describe('the Activity page in batches', () => {
  it('reads 30 events, and the next 30 when the end of the list comes near, with no repeat', async () => {
    const observer = stubIntersectionObserver()
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    for (let n = 1; n <= 35; n++) await addTestExpense(testDb.db, me.email, groupId, { description: `E${n}` })
    await testDb.db.update(expenseEvents).set({ occurredAt: new Date('2026-10-20T10:00:00Z') })
    renderActivity()

    await screen.findByRole('list', { name: 'Activity' })
    expect(rows()).toHaveLength(30)
    expect(screen.getByTestId('list-end')).toBeInTheDocument()

    observer.reach()

    await waitFor(() => expect(rows()).toHaveLength(35))
    expect(new Set(rows().map((row) => row.textContent)).size).toBe(35)
    expect(screen.queryByTestId('list-end')).not.toBeInTheDocument()
    observer.restore()
  })

  it('does not read the next batch again while one is being read', async () => {
    const observer = stubIntersectionObserver()
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    for (let n = 1; n <= 35; n++) await addTestExpense(testDb.db, me.email, groupId, { description: `E${n}` })
    renderActivity()
    await screen.findByRole('list', { name: 'Activity' })
    const real = activityService.listActivity
    let release: () => void = () => {}
    const slow = vi.spyOn(activityService, 'listActivity').mockImplementation(
      (...args) => new Promise((resolve) => (release = () => resolve(real(...args)))),
    )

    observer.reach()
    await screen.findByLabelText('Loading more activity')
    observer.reach()
    observer.reach()
    release()

    await waitFor(() => expect(rows()).toHaveLength(35))
    expect(slow).toHaveBeenCalledTimes(1)
    observer.restore()
  })

  it('ends the list in a row with Try again when a batch cannot be read, keeping the rows', async () => {
    const observer = stubIntersectionObserver()
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    for (let n = 1; n <= 31; n++) await addTestExpense(testDb.db, me.email, groupId, { description: `E${n}` })
    renderActivity()
    await screen.findByRole('list', { name: 'Activity' })
    const real = activityService.listActivity
    vi.spyOn(activityService, 'listActivity').mockRejectedValueOnce(new Error('broken')).mockImplementation(real)

    observer.reach()

    expect(await screen.findByText("Couldn't load more.")).toBeInTheDocument()
    expect(rows()).toHaveLength(30)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(rows()).toHaveLength(31))
    observer.restore()
  })
})

describe('the Activity page when it cannot be read', () => {
  it('says so with Try again and a Back button, and reads again', async () => {
    const real = activityService.listActivity
    vi.spyOn(activityService, 'listActivity').mockRejectedValueOnce(new Error('disk')).mockImplementation(real)
    const page = renderActivity()

    expect(await screen.findByText("Couldn't load your activity")).toBeInTheDocument()
    expect(screen.getByText('disk')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No activity yet')).toBeInTheDocument()

    expect(page.currentPath()).toBe(ROUTES.activity)
  })
})

describe('coming back to the Activity page', () => {
  /** A stand-in for the version page, with the Back arrow that returns here. */
  function VersionStandIn() {
    const navigate = useNavigate()
    return <button onClick={() => navigate(-1)}>Back to Activity</button>
  }

  it('shows the list at once, with no loader, even after leaving marked everything seen', async () => {
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    await addArrivedExpense(groupId, 'Hers', new Date('2020-01-01T00:00:00Z'))
    renderPage(<ActivityPage />, {
      path: ROUTES.activity,
      extra: [{ path: ROUTES.expenseVersionPattern, element: <VersionStandIn /> }],
    })
    await screen.findByRole('list', { name: 'Activity' })
    await userEvent.click(within(rows()[0]).getByRole('link'))
    // Leaving marks everything seen; that must not make the app forget the page.
    await waitFor(async () => expect(await testDb.db.select().from(syncStatus)).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: 'Back to Activity' }))

    expect(screen.queryByRole('status', { name: 'Loading your activity' })).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Activity' })).toBeInTheDocument()
    expect(rows()).toHaveLength(1)
  })

  it('keeps as many rows as it had loaded when it reads again', async () => {
    const observer = stubIntersectionObserver()
    const groupId = (await testDb.db.query.groups.findFirst())!.id
    for (let n = 1; n <= 35; n++) await addTestExpense(testDb.db, me.email, groupId, { description: `E${n}` })
    renderPage(<ActivityPage />, {
      path: ROUTES.activity,
      extra: [{ path: ROUTES.expenseVersionPattern, element: <VersionStandIn /> }],
    })
    await screen.findByRole('list', { name: 'Activity' })
    observer.reach()
    await waitFor(() => expect(rows()).toHaveLength(35))
    await userEvent.click(within(rows()[0]).getByRole('link'))

    await userEvent.click(screen.getByRole('button', { name: 'Back to Activity' }))

    expect(rows()).toHaveLength(35)
    // After the page read again, behind what it showed, there are still all of them.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(rows()).toHaveLength(35)
    observer.restore()
  })
})
