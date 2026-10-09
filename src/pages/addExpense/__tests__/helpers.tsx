import { fireEvent, screen, within } from '@testing-library/react'
import { ROUTES } from '../../../routes.ts'
import { groupService } from '../../../services/groupService'
import type { CreateGroupInput } from '../../../services/groupService/types.ts'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { renderPage } from '../../../testing/render.tsx'
import { AddExpensePage } from '../index.tsx'

export const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }

/**
 * Gives a test file the in-memory database and the two things nearly every
 * test needs: a group to add expenses to, and the page rendered inside it.
 * Call it once at the top level of the test file.
 */
export function setUpAddExpenseTests() {
  const testDb = setUpTestDatabase()

  async function createGroup(input: Partial<CreateGroupInput> = {}) {
    const result = await groupService.createGroup(testDb.db, me, {
      name: 'Goa trip',
      type: 'trip',
      defaultCurrency: 'GBP',
      memberEmails: [],
      ...input,
    })
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    return result.groupId
  }

  function renderForm(groupId: string) {
    return renderPage(<AddExpensePage />, {
      path: ROUTES.newExpense(groupId),
      pattern: ROUTES.newExpensePattern,
      routes: [ROUTES.groupPattern, ROUTES.home],
    })
  }

  return { testDb, createGroup, renderForm }
}

/**
 * Matches a button by its text. Ant Design icons add their own name in front
 * ("calendar Today, 8 Oct 2026"), with or without a space between them (only
 * the page's styles make it a space), so the text is matched at the end, and
 * not as the end of a longer number.
 */
export function named(text: string) {
  return new RegExp(`(?<!\\d)${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
}

export const descriptionInput = () => screen.getByRole('textbox', { name: 'Description' })
export const amountInput = () => screen.getByRole('textbox', { name: 'Amount' })
export const notesInput = () => screen.getByRole('textbox', { name: 'Notes' })
export const saveButton = () => screen.getByRole('button', { name: 'Save' })

/**
 * Changes a field the way the browser does when a key is typed: the new text
 * and the caret's position, then an input event. The value is set with the
 * browser's own setter, so React sees it as typed rather than set by itself.
 */
export function typeAsBrowser(input: HTMLInputElement, value: string, caret: number) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setValue?.call(input, value)
  input.setSelectionRange(caret, caret)
  fireEvent.input(input)
}

/** The form row of a field, to look for the message shown under it. */
export function fieldOf(input: HTMLElement) {
  return input.closest('.ant-form-item') as HTMLElement
}

/** The names of the entries of a section ("Recent") of the currency picker. */
export function currencySection(dialog: HTMLElement, name: string) {
  return within(within(dialog).getByRole('group', { name }))
    .getAllByRole('button')
    .map((button) => button.textContent)
}
