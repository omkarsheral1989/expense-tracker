// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expenseEvents } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense } from '../../../testing/expenses.ts'
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

beforeEach(() => useAuthStore.setState({ profile: me, token: null }))
afterEach(cleanup)

async function setUp() {
  const group = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
  if (!group.ok) throw new Error('group')
  const expenseId = await addTestExpense(testDb.db, me.email, group.groupId, { description: 'Dinner' })
  const [added] = await testDb.db.select().from(expenseEvents).where(eq(expenseEvents.expenseId, expenseId))
  return { groupId: group.groupId, expenseId, versionPath: ROUTES.expenseVersion(group.groupId, expenseId, added.id) }
}

function renderExpense(groupId: string, expenseId: string, state?: unknown) {
  return renderPage(<ExpensePage />, {
    path: ROUTES.expense(groupId, expenseId),
    pattern: ROUTES.expensePattern,
    routes: [ROUTES.groupPattern, ROUTES.expenseVersionPattern],
    state,
  })
}

async function pressBack(page: ReturnType<typeof renderExpense>) {
  await userEvent.click(await screen.findByRole('button', { name: 'Back' }))
  return page.currentPath()
}

describe('Back on the expense page, opened from a version page (PRD 5.6c)', () => {
  it('returns to that version page', async () => {
    const { groupId, expenseId, versionPath } = await setUp()

    expect(await pressBack(renderExpense(groupId, expenseId, { backTo: versionPath }))).toBe(versionPath)
  })

  it('returns to the group when opened any other way', async () => {
    const { groupId, expenseId } = await setUp()

    expect(await pressBack(renderExpense(groupId, expenseId))).toBe(ROUTES.group(groupId))
  })

  it('ignores a place to return to that is not in this group, or not an address', async () => {
    const { groupId, expenseId } = await setUp()
    const elsewhere = ROUTES.expenseVersion(crypto.randomUUID(), expenseId, crypto.randomUUID())
    for (const backTo of [elsewhere, '/members', 42, null]) {
      expect(await pressBack(renderExpense(groupId, expenseId, { backTo }))).toBe(ROUTES.group(groupId))
      cleanup()
    }
  })
})
