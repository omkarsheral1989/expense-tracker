import { and, asc, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm'
import { displayName } from '../groupService/utils.ts'
import type { Database } from '../../db/client.ts'
import { expensePhotos, expenseShares, expenses, groupMembers, groups, people } from '../../db/schema.ts'
import {
  CATEGORY_GROUPS,
  DEFAULT_CATEGORY,
  RECENT_CURRENCY_COUNT,
  SETTLEMENT_CATEGORY,
  SETTLEMENT_DESCRIPTION,
} from './constants.ts'
import { createExpenseSchema, toFieldErrors } from './schemas.ts'
import type {
  CreateExpenseInput,
  CreateExpenseResult,
  CreateSettlementErrors,
  CreateSettlementInput,
  CreateSettlementResult,
  CurrencyBalance,
  ExpenseDetails,
  ExpenseListItem,
  ExpensePayer,
  PersonBalance,
} from './types.ts'
import { CATEGORIES, categoryOf, computeShares, pairBalances, settlementSentence, titleOf } from './utils.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const expenseService = {
  /** The categories in their groups, as the picker lists them (a settlement's is not offered). */
  categoryGroups: CATEGORY_GROUPS.filter((group) => group.key !== SETTLEMENT_CATEGORY),

  /** The category of a settlement. */
  settlementCategory: SETTLEMENT_CATEGORY,

  /** What the details page calls an expense: its description, or who paid whom for a settlement. */
  titleOf,

  /** Who paid whom in a settlement: "You paid Priya", "Priya paid you". */
  settlementSentence,

  /** Every category, in the picker's order. */
  categories: CATEGORIES,

  /** The category a new expense starts with. */
  defaultCategory: DEFAULT_CATEGORY,

  /** The category with this key; an unknown key reads as the default one. */
  categoryOf,

  /**
   * Adds an expense to a group, with who paid and how it is split, all or
   * nothing. Anything wrong with the input, including a split that does not
   * add up, comes back as one message per field, to show beside it; every
   * problem is reported at once. A user who is not a member of the group, or a
   * group that does not exist, is unexpected (the page only offers groups the
   * user is in) and throws.
   */
  async createExpense(
    db: Database,
    userId: string,
    groupId: string,
    input: CreateExpenseInput,
  ): Promise<CreateExpenseResult> {
    const parsed = createExpenseSchema.safeParse(input)

    return db.transaction(async (tx): Promise<CreateExpenseResult> => {
      const members = await tx
        .select({ personId: groupMembers.personId })
        .from(groupMembers)
        .innerJoin(groups, and(eq(groups.id, groupMembers.groupId), isNull(groups.deletedAt)))
        .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.deletedAt)))
      const memberIds = members.map((member) => member.personId)
      if (!memberIds.includes(userId)) throw new Error('The user is not a member of this group.')

      const errors = parsed.success ? {} : toFieldErrors(parsed.error)
      // The split can only be checked against a usable amount.
      const amountMinor = parsed.success ? parsed.data.amountMinor : input.amountMinor
      const result =
        typeof amountMinor === 'number' && Number.isSafeInteger(amountMinor) && amountMinor > 0 && !errors.split
          ? computeShares(amountMinor, input.split, input.paidBy, memberIds)
          : null
      if (result && !result.ok) {
        if (result.message === 'Choose who paid.') errors.paidBy ??= result.message
        else errors.split = result.message
      }
      if (!parsed.success || !result?.ok) return { ok: false, errors }

      const { description, category, currency, date, notes, split, receipts } = parsed.data
      const id = crypto.randomUUID()
      const updatedAt = new Date()
      await tx.insert(expenses).values({
        id,
        groupId,
        description,
        category,
        amountMinor: parsed.data.amountMinor,
        currency,
        date,
        notes,
        method: split.method,
        createdBy: userId,
        updatedBy: userId,
        updatedAt,
      })
      await tx.insert(expenseShares).values(
        result.shares.map((share) => ({
          ...share,
          expenseId: id,
          updatedBy: userId,
          updatedAt,
        })),
      )
      if (receipts.length > 0) {
        await tx.insert(expensePhotos).values(
          receipts.map((receipt, position) => ({
            id: receipt.id,
            expenseId: id,
            position,
            mimeType: receipt.mimeType,
            sizeBytes: receipt.sizeBytes,
            updatedBy: userId,
            updatedAt,
          })),
        )
      }
      return { ok: true, expenseId: id }
    })
  },

  /**
   * Records that one member paid another outside the app ("You paid Priya"),
   * so it counts against what they owe each other. A settlement is saved as an
   * expense in the 'settlement' category: the payer paid all of it and the
   * recipient owes all of it, so balances, the list and the details page work
   * with no extra code. Problems come back as one message per field, like
   * `createExpense`; the payer and the recipient must be different members.
   */
  async createSettlement(
    db: Database,
    userId: string,
    groupId: string,
    input: CreateSettlementInput,
  ): Promise<CreateSettlementResult> {
    const recipientProblem = !input.recipientId
      ? 'Choose who received it.'
      : input.recipientId === input.payerId
        ? 'Choose someone other than the payer.'
        : undefined

    const result = await expenseService.createExpense(db, userId, groupId, {
      description: SETTLEMENT_DESCRIPTION,
      category: SETTLEMENT_CATEGORY,
      amountMinor: input.amountMinor,
      currency: input.currency,
      date: input.date,
      notes: input.notes,
      paidBy: input.payerId,
      // With no usable recipient the split is left empty, which cannot add up,
      // so nothing is saved.
      split: {
        method: 'exact',
        values: recipientProblem ? {} : { [input.recipientId]: input.amountMinor ?? 0 },
      },
      receipts: input.receipts,
    })
    if (result.ok) return result

    const { amountMinor, currency, date, notes, receipts, paidBy, split } = result.errors
    const errors: CreateSettlementErrors = {
      amountMinor,
      currency,
      date,
      notes,
      receipts,
      payerId: paidBy,
      recipientId: recipientProblem ?? (split ? 'Choose someone from the group.' : undefined),
    }
    return {
      ok: false,
      errors: Object.fromEntries(Object.entries(errors).filter(([, message]) => message)),
    }
  },

  /**
   * A group's expenses as one user sees them: newest day first (the latest
   * change first within a day), each with who paid and what the user paid and
   * owes. Deleted expenses and shares are left out. Empty for someone who is not in
   * the group.
   */
  async listExpenses(
    db: Database,
    userId: string,
    groupId: string,
  ): Promise<ExpenseListItem[]> {
    // Only for someone in the group.
    const [member] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.personId, userId),
          isNull(groupMembers.deletedAt),
        ),
      )
    if (!member) return []

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

      // A settlement's recipient is the one who owes it all.
      const recipientShare =
        row.category === SETTLEMENT_CATEGORY
          ? own.filter((share) => share.owedMinor > 0).sort((a, b) => b.owedMinor - a.owedMinor)[0]
          : undefined
      const recipient: ExpensePayer | undefined = recipientShare && {
        personId: recipientShare.personId,
        email: recipientShare.email,
        name: recipientShare.name,
        isYou: recipientShare.personId === userId,
      }

      return {
        ...row,
        payer,
        ...(recipient && { recipient }),
        yourPaidMinor: mine?.paidMinor ?? 0,
        yourOwedMinor: mine?.owedMinor ?? 0,
        involved: !!mine && (mine.paidMinor > 0 || mine.owedMinor > 0),
      }
    })
  },

  /**
   * One expense with every member's part, for its details page. Null when the
   * user cannot see it: an unknown or malformed id, a deleted expense, one of
   * another group, or a group the user is not a member of (they all look the
   * same, as for groups).
   */
  async getExpense(
    db: Database,
    userId: string,
    groupId: string,
    expenseId: string,
  ): Promise<ExpenseDetails | null> {
    if (!UUID.test(groupId) || !UUID.test(expenseId)) return null

    const [membership] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .innerJoin(groups, and(eq(groups.id, groupMembers.groupId), isNull(groups.deletedAt)))
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.personId, userId),
          isNull(groupMembers.deletedAt),
        ),
      )
    if (!membership) return null

    const [expense] = await db
      .select({
        id: expenses.id,
        groupId: expenses.groupId,
        description: expenses.description,
        category: expenses.category,
        amountMinor: expenses.amountMinor,
        currency: expenses.currency,
        date: expenses.date,
        notes: expenses.notes,
        method: expenses.method,
        createdById: expenses.createdBy,
        createdByEmail: people.email,
        createdByName: people.name,
      })
      .from(expenses)
      .innerJoin(people, eq(people.id, expenses.createdBy))
      .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId), isNull(expenses.deletedAt)))
    if (!expense) return null

    const rows = await db
      .select({
        personId: expenseShares.personId,
        email: people.email,
        name: people.name,
        paidMinor: expenseShares.paidMinor,
        owedMinor: expenseShares.owedMinor,
      })
      .from(expenseShares)
      .innerJoin(people, eq(people.id, expenseShares.personId))
      .where(and(eq(expenseShares.expenseId, expenseId), isNull(expenseShares.deletedAt)))

    const label = (share: { name: string | null; email: string | null }) => displayName(share).toLowerCase()
    const shares = rows
      .filter((row) => row.paidMinor > 0 || row.owedMinor > 0)
      .map((row) => ({ ...row, isYou: row.personId === userId }))
      .sort((a, b) => Number(b.isYou) - Number(a.isYou) || label(a).localeCompare(label(b)))

    const receipts = await db
      .select({ id: expensePhotos.id, mimeType: expensePhotos.mimeType })
      .from(expensePhotos)
      .where(and(eq(expensePhotos.expenseId, expenseId), isNull(expensePhotos.deletedAt)))
      .orderBy(asc(expensePhotos.position), asc(expensePhotos.id))

    const { createdById, createdByEmail, createdByName, ...details } = expense
    return {
      ...details,
      createdBy: { email: createdByEmail, name: createdByName, isYou: createdById === userId },
      shares,
      receipts,
    }
  },

  /**
   * What the user and each other person in a group owe each other, one entry
   * per person and currency that is not settled, in the order of the people's
   * names (or emails) and then currency codes. Worked out from the live shares
   * of the group's live expenses each time, never stored, so edits and synced
   * changes can never leave it out of date. Empty for an unknown user.
   */
  async groupBalances(
    db: Database,
    userId: string,
    groupId: string,
  ): Promise<PersonBalance[]> {
    const rows = await db
      .select({
        expenseId: expenses.id,
        currency: expenses.currency,
        personId: expenseShares.personId,
        paidMinor: expenseShares.paidMinor,
        owedMinor: expenseShares.owedMinor,
      })
      .from(expenseShares)
      .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
      .where(
        and(
          eq(expenses.groupId, groupId),
          isNull(expenses.deletedAt),
          isNull(expenseShares.deletedAt),
        ),
      )

    const byExpense = new Map<string, { currency: string; shares: typeof rows }>()
    for (const row of rows) {
      const expense = byExpense.get(row.expenseId) ?? { currency: row.currency, shares: [] }
      expense.shares.push(row)
      byExpense.set(row.expenseId, expense)
    }
    const balances = pairBalances(userId, [...byExpense.values()])
    if (balances.length === 0) return []

    const named = await db
      .select({ id: people.id, email: people.email, name: people.name })
      .from(people)
      .where(inArray(people.id, [...new Set(balances.map((balance) => balance.personId))]))
    const label = (person: { name: string | null; email: string | null }) =>
      displayName(person).toLowerCase()

    return balances
      .map((balance) => {
        const person = named.find((one) => one.id === balance.personId)
        return {
          ...balance,
          email: person?.email ?? null,
          name: person?.name ?? null,
        }
      })
      .sort(
        (a, b) =>
          label(a).localeCompare(label(b)) ||
          a.personId.localeCompare(b.personId) ||
          a.currency.localeCompare(b.currency),
      )
  },

  /**
   * The user's overall balance in each of their groups, per currency: what
   * they paid minus their shares, across the group's live expenses. Groups and
   * currencies that come to zero are left out. Keyed by group id.
   */
  async balancesByGroup(
    db: Database,
    userId: string,
  ): Promise<Record<string, CurrencyBalance[]>> {
    const net = sql<number>`sum(${expenseShares.paidMinor} - ${expenseShares.owedMinor})`.mapWith(Number)
    const rows = await db
      .select({ groupId: expenses.groupId, currency: expenses.currency, amountMinor: net })
      .from(expenseShares)
      .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
      .where(
        and(
          eq(expenseShares.personId, userId),
          isNull(expenseShares.deletedAt),
          isNull(expenses.deletedAt),
        ),
      )
      .groupBy(expenses.groupId, expenses.currency)
      .orderBy(asc(expenses.currency))

    const balances: Record<string, CurrencyBalance[]> = {}
    for (const row of rows) {
      if (row.amountMinor === 0) continue
      ;(balances[row.groupId] ??= []).push({ currency: row.currency, amountMinor: row.amountMinor })
    }
    return balances
  },

  /**
   * The currencies of the user's own latest expenses, most recent first, each
   * once: what the currency picker offers as "Recent".
   */
  async recentCurrencies(db: Database, userId: string): Promise<string[]> {
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
