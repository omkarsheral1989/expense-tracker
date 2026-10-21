import { eq } from 'drizzle-orm'
import { vi } from 'vitest'
import { expenseEvents, people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { expenseService } from '../../../services/expenseService'
import type { CreateExpenseInput } from '../../../services/expenseService/types.ts'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { ExpenseVersionPage } from '../index.tsx'

export const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }

/**
 * Gives a test file the in-memory database and what nearly every test needs: a
 * group of three (you, Priya Shah and Sam), expenses to give a history, and the
 * version page rendered for one event. Call it once at the top level of the file.
 */
export function setUpVersionTests() {
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

  /** "Beach shack dinner", 9.00 GBP on 5 Oct 2026 with notes, paid by you and split equally. */
  function addExpense(groupId: string, overrides: Partial<CreateExpenseInput> = {}) {
    return addTestExpense(testDb.db, me.email, groupId, {
      description: 'Beach shack dinner',
      category: 'food.dining_out',
      amountMinor: 900,
      date: '2026-10-05',
      notes: 'Card',
      ...overrides,
    })
  }

  /** Saves an edit by `email` at the time of day given (21 Oct 2026): the saved expense with the fields given replaced. */
  async function editAt(
    email: string,
    groupId: string,
    expenseId: string,
    hour: number,
    minute: number,
    overrides: Partial<CreateExpenseInput>,
  ) {
    vi.setSystemTime(new Date(2026, 9, 21, hour, minute))
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

  /** The events of an expense, oldest first. */
  async function eventsOf(expenseId: string) {
    const order = ['added', 'edited', 'deleted', 'restored', 'reverted']
    const rows = await testDb.db.select().from(expenseEvents).where(eq(expenseEvents.expenseId, expenseId))
    return rows.toSorted((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || order.indexOf(a.kind) - order.indexOf(b.kind))
  }

  function renderVersion(groupId: string, expenseId: string, eventId: string) {
    return renderPage(<ExpenseVersionPage />, {
      path: ROUTES.expenseVersion(groupId, expenseId, eventId),
      pattern: ROUTES.expenseVersionPattern,
      routes: [ROUTES.expensePattern, ROUTES.groupPattern],
    })
  }

  return { testDb, createGroup, addExpense, editAt, eventsOf, renderVersion }
}

/** Matches a button by the end of its name (Ant Design puts an icon's name in front of its text). */
export function named(text: string) {
  return new RegExp(`(?<!\\d)${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
}
