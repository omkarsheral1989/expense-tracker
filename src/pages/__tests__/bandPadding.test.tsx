// @vitest-environment jsdom
// The colored bands of the group page and the expense page pad the same on all
// four sides, and the content under them starts the same distance below
// (ADR-030, BAND_BOTTOM_PADDING and UNDER_BAND_PADDING).
import 'fake-indexeddb/auto'
import { cleanup, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../db/client.ts'
import { ROUTES } from '../../routes.ts'
import { useAuthStore } from '../../stores/useAuthStore'
import { BAND_BOTTOM_PADDING, HEADER_TOP_PADDING, UNDER_BAND_PADDING } from '../../theme/safeArea.ts'
import { setUpTestDatabase } from '../../testing/database.ts'
import { addTestExpense, addTestSettlement } from '../../testing/expenses.ts'
import { createTestGroup, ensurePersonId } from '../../testing/groups.ts'
import { renderPage } from '../../testing/render.tsx'
import { ExpensePage } from '../expense/index.tsx'
import { GroupPage } from '../group/index.tsx'

vi.mock('../../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: false }))
vi.mock('../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const testDb = setUpTestDatabase()

beforeEach(async () => {
  useAuthStore.setState({ profile: me, guest: false, token: null })
  await ensurePersonId(testDb.db, me.email, me.name)
  vi.mocked(getDb).mockImplementation(async () => testDb.db)
})
afterEach(() => {
  cleanup()
  vi.mocked(getDb).mockReset()
})

/** The block around the Back button that pads for the status bar: the band. */
function band(): HTMLElement {
  let element: HTMLElement | null = screen.getByRole('button', { name: 'Back' })
  while (element) {
    if ((element.getAttribute('style') ?? '').includes('env(safe-area-inset-top)')) return element
    element = element.parentElement
  }
  throw new Error('no band')
}

async function setUp() {
  const created = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
  if (!created.ok) throw new Error('group')
  const expense = await addTestExpense(testDb.db, me.email, created.groupId, { description: 'Dinner', amountMinor: 900 })
  const payment = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', created.groupId)
  return { group: created.groupId, expense, payment }
}

type Ids = Awaited<ReturnType<typeof setUp>>
const PAGES: { name: string; page: ReactElement; path: (ids: Ids) => string; pattern: string }[] = [
  { name: 'the group page', page: <GroupPage />, path: ({ group }) => ROUTES.group(group), pattern: ROUTES.groupPattern },
  { name: 'the expense page', page: <ExpensePage />, path: ({ group, expense }) => ROUTES.expense(group, expense), pattern: ROUTES.expensePattern },
  { name: 'the page of a payment', page: <ExpensePage />, path: ({ group, payment }) => ROUTES.expense(group, payment), pattern: ROUTES.expensePattern },
]

describe.each(PAGES)('$name', ({ page, path, pattern }) => {
  it('pads its band 16 px at the sides and the bottom, as at the top, and starts its content 16 px below it', async () => {
    const ids = await setUp()
    renderPage(page, { path: path(ids), pattern, routes: [ROUTES.home, ROUTES.groupPattern] })
    await screen.findByRole('button', { name: 'Back' })

    const bandStyle = band().getAttribute('style') ?? ''
    expect(bandStyle).toContain(`padding: calc(${HEADER_TOP_PADDING}px + env(safe-area-inset-top)) 16px ${BAND_BOTTOM_PADDING}px`)
    const under = band().nextElementSibling as HTMLElement
    expect(under.getAttribute('style') ?? '').toMatch(new RegExp(`padding(-top)?: ${UNDER_BAND_PADDING}px`))
  })
})

describe('the constants', () => {
  it('are all 16, so the band and what is under it have the same space on every side', () => {
    expect([HEADER_TOP_PADDING, BAND_BOTTOM_PADDING, UNDER_BAND_PADDING]).toEqual([16, 16, 16])
  })
})
