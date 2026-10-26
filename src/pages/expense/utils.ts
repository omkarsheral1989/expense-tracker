import { getDb } from '../../db/client.ts'
import { accountService } from '../../services/accountService'
import { expenseService } from '../../services/expenseService'
import type { ExpenseWithPayment, KnownExpense, KnownPerson } from './types.ts'

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** A person as the list names them, or null when what came is not one. */
function personFrom(value: unknown): KnownPerson | null {
  const person = value as Partial<KnownPerson> | null
  if (!person || typeof person.isYou !== 'boolean') return null
  if (person.name !== null && typeof person.name !== 'string') return null
  if (person.email !== null && typeof person.email !== 'string') return null
  return { name: person.name, email: person.email, isYou: person.isYou }
}

/**
 * The expense the page was opened with (`location.state`), when it is one for
 * this page: the same group and expense and every field the band shows. A
 * payment must also say who paid whom, and a deleted expense who deleted it
 * and when. Anything else, such as a direct link, gives null and the page loads
 * as before.
 */
export function knownExpenseFrom(state: unknown, groupId: string, expenseId: string): KnownExpense | null {
  const expense = (state as { expense?: Partial<KnownExpense> & { deleted?: { by?: unknown; at?: unknown } } } | null)?.expense
  if (
    !expense ||
    expense.id !== expenseId ||
    expense.groupId !== groupId ||
    typeof expense.description !== 'string' ||
    typeof expense.category !== 'string' ||
    typeof expense.amountMinor !== 'number' ||
    typeof expense.currency !== 'string' ||
    typeof expense.date !== 'string' ||
    !DAY.test(expense.date)
  ) {
    return null
  }
  const { id, description, category, amountMinor, currency, date } = expense
  const known: KnownExpense = { id, groupId, description, category, amountMinor, currency, date }

  if (category === expenseService.settlementCategory) {
    const payer = personFrom(expense.payer)
    const recipient = personFrom(expense.recipient)
    if (!payer || !recipient) return null
    known.payer = payer
    known.recipient = recipient
  }
  if (expense.deleted) {
    const by = personFrom(expense.deleted.by)
    const at = expense.deleted.at
    if (!by || !(at instanceof Date) || Number.isNaN(at.getTime())) return null
    known.deleted = { by, at }
  }
  return known
}

/** What a known expense is called: its description, or who paid whom for a payment. */
export function knownTitle(expense: KnownExpense): string {
  if (expense.category !== expenseService.settlementCategory || !expense.payer || !expense.recipient) return expense.description
  return expenseService.settlementSentence(expense.payer, expense.recipient)
}

/** What the expense page reads: the expense, and its payment method on this device. Null when the user cannot see the expense. */
export async function loadExpensePage(userId: string, groupId: string, expenseId: string): Promise<ExpenseWithPayment | null> {
  const db = await getDb()
  const expense = await expenseService.getExpense(db, userId, groupId, expenseId)
  if (!expense) return null
  return { ...expense, paymentMethod: await accountService.getPaymentMethod(db, expenseId) }
}
