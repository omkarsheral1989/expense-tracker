import { QueryClient } from '@tanstack/react-query'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PAGE_QUERY_ROOT } from '../../../hooks/useCachedData/constants.ts'
import { people } from '../../../db/schema.ts'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import type { GroupBalances } from '../../../services/balancesService/types.ts'
import { BALANCES_PAGE, balancesKey, refreshBalancesPage } from '../utils.ts'

vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const testDb = setUpTestDatabase()

beforeEach(() => vi.restoreAllMocks())

describe('refreshBalancesPage', () => {
  it('reads the balances into the cache under the page\'s own key, so the page finds them already read', async () => {
    const result = await createTestGroup(testDb.db, me, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'] })
    if (!result.ok) throw new Error('group')
    await testDb.db.update(people).set({ name: 'Priya' }).where(eq(people.email, 'priya@gmail.com'))
    await addTestExpense(testDb.db, me.email, result.groupId, { amountMinor: 1000 })
    const userId = await personIdOf(testDb.db, me.email)
    const client = new QueryClient()

    await refreshBalancesPage(client, userId, result.groupId)

    const cached = client.getQueryData<GroupBalances>([PAGE_QUERY_ROOT, BALANCES_PAGE, balancesKey(userId, result.groupId)])
    expect(cached?.groupId).toBe(result.groupId)
    expect(cached?.currencies[0].transfers).toEqual([expect.objectContaining({ amountMinor: 500 })])
  })

  it('leaves the failure for the page to show, and does not throw', async () => {
    const client = new QueryClient()

    await expect(refreshBalancesPage(client, 'nobody', 'not-a-group')).resolves.toBeUndefined()
    expect(client.getQueryData([PAGE_QUERY_ROOT, BALANCES_PAGE, balancesKey('nobody', 'not-a-group')])).toBeNull()
  })
})
