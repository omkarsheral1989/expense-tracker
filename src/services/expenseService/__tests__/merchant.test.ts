import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { expenseEvents, expenses } from '../../../db/schema.ts'
import { addTestExpense, expenseInput, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup, type TestUser } from '../../../testing/groups.ts'
import { expenseService } from '../index.ts'

let pg: PGlite
let db: Database

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})

afterAll(() => pg.close())

beforeEach(() => pg.exec('truncate expense_events, expense_photos, expense_shares, expenses, group_members, groups, people cascade'))

const omkar: TestUser = { email: 'omkar@gmail.com', name: 'Omkar' }
const priya: TestUser = { email: 'priya@gmail.com', name: 'Priya' }

async function createGroup(creator: TestUser, memberEmails: string[] = []) {
  const result = await createTestGroup(db, creator, {
    name: `Group ${crypto.randomUUID().slice(0, 8)}`,
    type: 'trip',
    defaultCurrency: 'INR',
    memberEmails,
  })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.groupId
}

const merchantOf = async (id: string) =>
  (await db.select({ merchant: expenses.merchant }).from(expenses).where(eq(expenses.id, id)))[0].merchant

describe('the merchant of an expense (PRD 5.5)', () => {
  it('is saved trimmed, with runs of spaces made one', async () => {
    const groupId = await createGroup(omkar)
    const id = await addTestExpense(db, omkar.email, groupId, { merchant: '  Astha   Medico ' })
    expect(await merchantOf(id)).toBe('Astha Medico')
  })

  it('is none when left out, empty or only spaces', async () => {
    const groupId = await createGroup(omkar)
    expect(await merchantOf(await addTestExpense(db, omkar.email, groupId))).toBeNull()
    expect(await merchantOf(await addTestExpense(db, omkar.email, groupId, { merchant: '' }))).toBeNull()
    expect(await merchantOf(await addTestExpense(db, omkar.email, groupId, { merchant: '   ' }))).toBeNull()
  })

  it('is refused above 60 characters, and accepted at 60', async () => {
    const groupId = await createGroup(omkar)
    const userId = await personIdOf(db, omkar.email)
    const tooLong = await expenseService.createExpense(
      db,
      userId,
      groupId,
      await expenseInput(db, omkar.email, groupId, { merchant: 'a'.repeat(61) }),
    )
    expect(tooLong).toEqual({ ok: false, errors: { merchant: 'Use at most 60 characters.' } })
    expect(await merchantOf(await addTestExpense(db, omkar.email, groupId, { merchant: 'a'.repeat(60) }))).toBe('a'.repeat(60))
  })

  it('is in the added event\'s snapshot and in getExpense and getExpenseToEdit', async () => {
    const groupId = await createGroup(omkar)
    const userId = await personIdOf(db, omkar.email)
    const id = await addTestExpense(db, omkar.email, groupId, { merchant: 'Blinkit' })

    const [event] = await db.select().from(expenseEvents).where(eq(expenseEvents.expenseId, id))
    expect(event.snapshot.merchant).toBe('Blinkit')
    expect((await expenseService.getExpense(db, userId, groupId, id))?.merchant).toBe('Blinkit')
    expect((await expenseService.getExpenseToEdit(db, userId, groupId, id))?.merchant).toBe('Blinkit')
  })

  it('changing it records an edit with the old and new merchant, and clearing it stores none', async () => {
    const groupId = await createGroup(omkar)
    const userId = await personIdOf(db, omkar.email)
    const id = await addTestExpense(db, omkar.email, groupId, { merchant: 'Blinkit' })

    const input = await expenseInput(db, omkar.email, groupId)
    const changed = await expenseService.updateExpense(db, userId, groupId, id, { ...input, merchant: 'Zepto' })
    expect(changed).toMatchObject({ ok: true, changed: true })
    expect(await merchantOf(id)).toBe('Zepto')
    const cleared = await expenseService.updateExpense(db, userId, groupId, id, { ...input, merchant: '' })
    expect(cleared).toMatchObject({ ok: true, changed: true })
    expect(await merchantOf(id)).toBeNull()

    const events = await db.select().from(expenseEvents).where(eq(expenseEvents.kind, 'edited'))
    const changes = events.flatMap((event) => event.changes)
    expect(changes).toEqual(
      expect.arrayContaining([
        { field: 'merchant', from: 'Blinkit', to: 'Zepto' },
        { field: 'merchant', from: 'Zepto', to: null },
      ]),
    )
  })

  it('saving the same merchant changes nothing', async () => {
    const groupId = await createGroup(omkar)
    const userId = await personIdOf(db, omkar.email)
    const id = await addTestExpense(db, omkar.email, groupId, { merchant: 'Blinkit' })
    const input = await expenseInput(db, omkar.email, groupId, { merchant: ' Blinkit ' })
    expect(await expenseService.updateExpense(db, userId, groupId, id, input)).toMatchObject({ ok: true, changed: false })
  })

  it('goes back with a restored version', async () => {
    const groupId = await createGroup(omkar)
    const userId = await personIdOf(db, omkar.email)
    const id = await addTestExpense(db, omkar.email, groupId, { merchant: 'Blinkit' })
    await expenseService.updateExpense(db, userId, groupId, id, await expenseInput(db, omkar.email, groupId, { merchant: 'Zepto' }))
    const [added] = await db.select().from(expenseEvents).where(eq(expenseEvents.kind, 'added'))

    const restored = await expenseService.restoreVersion(db, userId, groupId, id, added.id)

    expect(restored.ok).toBe(true)
    expect(await merchantOf(id)).toBe('Blinkit')
  })
})

describe('listMerchants', () => {
  it('lists the user\'s own merchants first, then the group\'s, each once', async () => {
    const groupId = await createGroup(omkar, [priya.email])
    const userId = await personIdOf(db, omkar.email)
    await addTestExpense(db, priya.email, groupId, { merchant: 'Zepto' })
    await addTestExpense(db, omkar.email, groupId, { merchant: 'Blinkit' })
    await addTestExpense(db, omkar.email, groupId, { merchant: 'zepto' })
    await addTestExpense(db, omkar.email, groupId, { merchant: '1mg' })

    expect(await expenseService.listMerchants(db, userId)).toEqual(['1mg', 'zepto', 'Blinkit'])
  })

  it('leaves out expenses without a merchant and groups the user is not in', async () => {
    const mine = await createGroup(omkar)
    const theirs = await createGroup(priya)
    const userId = await personIdOf(db, omkar.email)
    await addTestExpense(db, omkar.email, mine)
    await addTestExpense(db, priya.email, theirs, { merchant: 'Secret shop' })

    expect(await expenseService.listMerchants(db, userId)).toEqual([])
  })
})
