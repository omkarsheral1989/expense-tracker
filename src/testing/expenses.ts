import { and, eq, isNull } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { groupMembers, people } from '../db/schema.ts'
import { expenseService } from '../services/expenseService'
import type { CreateExpenseInput, SplitInput } from '../services/expenseService/types.ts'

/** The id of the person with this email; fails the test when there is none. */
export async function personIdOf(db: Database, email: string): Promise<string> {
  const [person] = await db.select({ id: people.id }).from(people).where(eq(people.email, email))
  if (!person) throw new Error(`No person with the email ${email}.`)
  return person.id
}

/** A split of 'equal' between every current member of a group. */
export async function equalSplitOf(db: Database, groupId: string): Promise<SplitInput> {
  const members = await db
    .select({ personId: groupMembers.personId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.deletedAt)))
  return {
    method: 'equal',
    values: Object.fromEntries(members.map((member) => [member.personId, 1])),
  }
}

/**
 * A complete, valid expense for `createExpense`: "Dinner", 10.00 GBP on
 * 8 Oct 2026, paid by `userEmail` and split equally between every member,
 * with any field replaced by `overrides`.
 */
export async function expenseInput(
  db: Database,
  userEmail: string,
  groupId: string,
  overrides: Partial<CreateExpenseInput> = {},
): Promise<CreateExpenseInput> {
  return {
    description: 'Dinner',
    category: 'general',
    amountMinor: 1000,
    currency: 'GBP',
    date: '2026-10-08',
    notes: '',
    paidBy: await personIdOf(db, userEmail),
    split: await equalSplitOf(db, groupId),
    receipts: [],
    ...overrides,
  }
}

/** Adds an expense as `userEmail` (see `expenseInput`) and returns its id; fails the test if it is refused. */
export async function addTestExpense(
  db: Database,
  userEmail: string,
  groupId: string,
  overrides: Partial<CreateExpenseInput> = {},
): Promise<string> {
  const input = await expenseInput(db, userEmail, groupId, overrides)
  const result = await expenseService.createExpense(db, userEmail, groupId, input)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.expenseId
}
