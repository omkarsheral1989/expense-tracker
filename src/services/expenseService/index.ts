import { and, desc, eq, inArray, isNull, max } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { expenseShares, expenses, groupMembers, groups, people } from '../../db/schema.ts'
import { CATEGORY_GROUPS, DEFAULT_CATEGORY, RECENT_CURRENCY_COUNT } from './constants.ts'
import type { Transaction } from '../groupService/types.ts'
import { createExpenseSchema, toFieldErrors } from './schemas.ts'
import type {
  CreateExpenseInput,
  CreateExpenseResult,
  ExpenseListItem,
  ExpensePayer,
} from './types.ts'
import { CATEGORIES, categoryOf, splitEqually } from './utils.ts'

/** The id of the person with this email, or null when nobody has it. */
async function findPersonId(db: Database | Transaction, email: string): Promise<string | null> {
  const [person] = await db
    .select({ id: people.id })
    .from(people)
    .where(eq(people.email, email.trim().toLowerCase()))
  return person?.id ?? null
}

export const expenseService = {
  /** The categories in their groups, as the picker lists them. */
  categoryGroups: CATEGORY_GROUPS,

  /** Every category, in the picker's order. */
  categories: CATEGORIES,

  /** The category a new expense starts with. */
  defaultCategory: DEFAULT_CATEGORY,

  /** The category with this key; an unknown key reads as the default one. */
  categoryOf,

  /**
   * Adds an expense to a group, paid in full by the user and split equally
   * between every member, all or nothing. Anything wrong with the input comes
   * back as one message per field, to show beside it. A user who is not a
   * member of the group, or a group that does not exist, is unexpected (the
   * page only offers groups the user is in) and throws.
   */
  async createExpense(
    db: Database,
    userEmail: string,
    groupId: string,
    input: CreateExpenseInput,
  ): Promise<CreateExpenseResult> {
    const parsed = createExpenseSchema.safeParse(input)
    if (!parsed.success) return { ok: false, errors: toFieldErrors(parsed.error) }
    const expense = parsed.data

    return db.transaction(async (tx): Promise<CreateExpenseResult> => {
      const userId = await findPersonId(tx, userEmail)
      if (!userId) throw new Error('The signed-in user is not known on this device.')

      const members = await tx
        .select({ personId: groupMembers.personId })
        .from(groupMembers)
        .innerJoin(groups, and(eq(groups.id, groupMembers.groupId), isNull(groups.deletedAt)))
        .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.deletedAt)))
      const memberIds = members.map((member) => member.personId)
      if (!memberIds.includes(userId)) throw new Error('The user is not a member of this group.')

      const id = crypto.randomUUID()
      const updatedAt = new Date()
      await tx.insert(expenses).values({
        id,
        groupId,
        ...expense,
        method: 'equal',
        createdBy: userId,
        updatedBy: userId,
        updatedAt,
      })
      await tx.insert(expenseShares).values(
        splitEqually(expense.amountMinor, memberIds, userId).map((share) => ({
          ...share,
          expenseId: id,
          updatedBy: userId,
          updatedAt,
        })),
      )
      return { ok: true, expenseId: id }
    })
  },

  /**
   * A group's expenses as one user sees them: newest day first (the latest
   * change first within a day), each with who paid and what the user paid and
   * owes. Deleted expenses and shares are left out. Empty for a user who is not
   * known on this device.
   */
  async listExpenses(
    db: Database,
    userEmail: string,
    groupId: string,
  ): Promise<ExpenseListItem[]> {
    const userId = await findPersonId(db, userEmail)
    if (!userId) return []

    const rows = await db
      .select({
        id: expenses.id,
        description: expenses.description,
        category: expenses.category,
        amountMinor: expenses.amountMinor,
        currency: expenses.currency,
        date: expenses.date,
      })
      .from(expenses)
      .where(and(eq(expenses.groupId, groupId), isNull(expenses.deletedAt)))
      .orderBy(desc(expenses.date), desc(expenses.updatedAt), desc(expenses.id))
    if (rows.length === 0) return []

    const shares = await db
      .select({
        expenseId: expenseShares.expenseId,
        personId: expenseShares.personId,
        paidMinor: expenseShares.paidMinor,
        owedMinor: expenseShares.owedMinor,
        email: people.email,
        name: people.name,
      })
      .from(expenseShares)
      .innerJoin(people, eq(people.id, expenseShares.personId))
      .where(
        and(
          inArray(
            expenseShares.expenseId,
            rows.map((row) => row.id),
          ),
          isNull(expenseShares.deletedAt),
        ),
      )

    return rows.map((row) => {
      const own = shares.filter((share) => share.expenseId === row.id)
      const mine = own.find((share) => share.personId === userId)
      // The one who paid the most; with one payer, simply the payer.
      const payerShare = own
        .filter((share) => share.paidMinor > 0)
        .sort((a, b) => b.paidMinor - a.paidMinor)[0]
      const payer: ExpensePayer | null = payerShare
        ? {
            personId: payerShare.personId,
            email: payerShare.email,
            name: payerShare.name,
            isYou: payerShare.personId === userId,
          }
        : null

      return {
        ...row,
        payer,
        yourPaidMinor: mine?.paidMinor ?? 0,
        yourOwedMinor: mine?.owedMinor ?? 0,
        involved: !!mine && (mine.paidMinor > 0 || mine.owedMinor > 0),
      }
    })
  },

  /**
   * The currencies of the user's own latest expenses, most recent first, each
   * once: what the currency picker offers as "Recent".
   */
  async recentCurrencies(db: Database, userEmail: string): Promise<string[]> {
    const userId = await findPersonId(db, userEmail)
    if (!userId) return []

    const lastUsed = max(expenses.updatedAt)
    const rows = await db
      .select({ currency: expenses.currency, lastUsed })
      .from(expenses)
      .where(and(eq(expenses.createdBy, userId), isNull(expenses.deletedAt)))
      .groupBy(expenses.currency)
      .orderBy(desc(lastUsed), expenses.currency)
      .limit(RECENT_CURRENCY_COUNT)
    return rows.map((row) => row.currency)
  },
}
