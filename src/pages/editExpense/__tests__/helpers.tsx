import { eq } from 'drizzle-orm'
import { screen } from '@testing-library/react'
import { people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import type { CreateExpenseInput } from '../../../services/expenseService/types.ts'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense } from '../../../testing/expenses.ts'
import { createTestGroup, type TestGroupInput } from '../../../testing/groups.ts'
import { renderPage } from '../../../testing/render.tsx'
import { EditExpensePage } from '../index.tsx'

export const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }

/**
 * Gives a test file the in-memory database and what nearly every test needs: a
 * group of three (you, Priya Shah and Sam), an expense in it, and the edit page
 * rendered for that expense. Call it once at the top level of the test file.
 */
export function setUpEditExpenseTests() {
  const testDb = setUpTestDatabase()

  async function createGroup(input: Partial<TestGroupInput> = {}) {
    const result = await createTestGroup(testDb.db, me, {
      name: 'Goa trip',
      type: 'trip',
      defaultCurrency: 'GBP',
      memberEmails: ['priya@gmail.com', 'sam@gmail.com'],
      ...input,
    })
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
    return result.groupId
  }

  /** "Beach shack dinner", 9.00 GBP on 5 Oct 2026 with notes, paid by you and split equally. */
  async function addExpense(groupId: string, overrides: Partial<CreateExpenseInput> = {}) {
    return addTestExpense(testDb.db, me.email, groupId, {
      description: 'Beach shack dinner',
      category: 'food.dining_out',
      amountMinor: 900,
      date: '2026-10-05',
      notes: 'Card',
      ...overrides,
    })
  }

  function renderEdit(groupId: string, expenseId: string) {
    return renderPage(<EditExpensePage />, {
      path: ROUTES.editExpense(groupId, expenseId),
      pattern: ROUTES.editExpensePattern,
      routes: [ROUTES.expensePattern, ROUTES.groupPattern],
    })
  }

  return { testDb, createGroup, addExpense, renderEdit }
}

/** Matches a button by the end of its name (Ant Design puts an icon's name in front of its text). */
export function named(text: string) {
  return new RegExp(`(?<!\\d)${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
}

export const descriptionInput = () => screen.getByRole('textbox', { name: 'Description' })
export const amountInput = () => screen.getByRole('textbox', { name: 'Amount' })
export const notesInput = () => screen.getByRole('textbox', { name: 'Notes' })
export const saveButton = () => screen.getByRole('button', { name: 'Save' })

/** The sentence "Paid by [you] and split [equally]" as text. */
export function sentence() {
  return (screen.getByRole('button', { name: /^(equally|unequally)$/ }).closest('.ant-typography') as HTMLElement)
    .textContent
}
