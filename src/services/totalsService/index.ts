import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { expenseShares, expenses, groupMembers, groups, people } from '../../db/schema.ts'
import { shownName } from '../../db/shownName.ts'
import { SETTLEMENT_CATEGORY } from '../expenseService/constants.ts'
import { groupService } from '../groupService'
import type { CurrencyTotals, GroupTotals, SpentInCurrency, TotalsRow } from './types.ts'
import { orderCurrencies, sortRows } from './utils.ts'

/** The expenses that count as spending: live ones, payments between members left out (PRD 5.20). */
const counted = (groupId: string) =>
  and(eq(expenses.groupId, groupId), isNull(expenses.deletedAt), ne(expenses.category, SETTLEMENT_CATEGORY))

export const totalsService = {
  /**
   * What a group has spent and how it splits between its members, per currency, all time (PRD 5.20); null when the user cannot see
   * the group (unknown, deleted or not theirs, as `getGroup`). Amounts are never converted.
   */
  async groupTotals(db: Database, userId: string, groupId: string): Promise<GroupTotals | null> {
    const group = await groupService.getGroup(db, userId, groupId)
    if (!group) return null

    const totals = await db
      .select({ currency: expenses.currency, totalMinor: sql<string>`sum(${expenses.amountMinor})` })
      .from(expenses)
      .where(counted(groupId))
      .groupBy(expenses.currency)
    const parts = await db
      .select({
        currency: expenses.currency,
        personId: expenseShares.personId,
        paidMinor: sql<string>`sum(${expenseShares.paidMinor})`,
        owedMinor: sql<string>`sum(${expenseShares.owedMinor})`,
      })
      .from(expenseShares)
      .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
      .where(and(counted(groupId), isNull(expenseShares.deletedAt)))
      .groupBy(expenses.currency, expenseShares.personId)

    // Everyone in the group, and anyone else who has an amount (a person who is no longer a member).
    const known = new Map(group.members.map((member) => [member.personId, member]))
    const others = [...new Set(parts.map((part) => part.personId))].filter((id) => !known.has(id))
    const strangers = others.length
      ? await db
          .select({ personId: people.id, email: people.email, name: shownName(people), picture: people.picture })
          .from(people)
          .where(inArray(people.id, others))
      : []
    const everyone = [
      ...group.members.map((member) => ({ personId: member.personId, email: member.email, name: member.name, picture: member.picture ?? null, isYou: member.isYou })),
      ...strangers.map((person) => ({ ...person, picture: person.picture ?? null, isYou: person.personId === userId })),
    ]

    const currencies: CurrencyTotals[] = orderCurrencies(
      totals.map((total) => total.currency),
      group.defaultCurrency,
    ).map((currency) => {
      const rowFor = (pick: 'paidMinor' | 'owedMinor'): TotalsRow[] =>
        sortRows(
          everyone.map((person) => ({
            ...person,
            amountMinor: Number(parts.find((part) => part.currency === currency && part.personId === person.personId)?.[pick] ?? 0),
          })),
        )
      return {
        currency,
        totalMinor: Number(totals.find((total) => total.currency === currency)?.totalMinor ?? 0),
        shares: rowFor('owedMinor'),
        paid: rowFor('paidMinor'),
      }
    })

    return { groupId: group.id, defaultCurrency: group.defaultCurrency, currencies }
  },

  /** Whether the group has an expense that counts, which the group page's Totals pill needs. False for a group the user cannot see. */
  async hasSpending(db: Database, userId: string, groupId: string): Promise<boolean> {
    if (!(await groupService.getGroup(db, userId, groupId))) return false
    const [found] = await db.select({ id: expenses.id }).from(expenses).where(counted(groupId)).limit(1)
    return Boolean(found)
  },

  /**
   * What each of the user's groups has spent, per currency, for the home page's row of a group of one (PRD 5.2): the same sums as
   * `groupTotals`' totals (payments and deleted expenses left out), for every group the user is in, keyed by group id. A group with
   * nothing that counts has no entry.
   */
  async spentByGroup(db: Database, userId: string): Promise<Record<string, SpentInCurrency[]>> {
    const rows = await db
      .select({ groupId: expenses.groupId, currency: expenses.currency, totalMinor: sql<string>`sum(${expenses.amountMinor})` })
      .from(expenses)
      .innerJoin(groups, and(eq(groups.id, expenses.groupId), isNull(groups.deletedAt)))
      .innerJoin(groupMembers, and(eq(groupMembers.groupId, expenses.groupId), eq(groupMembers.personId, userId), isNull(groupMembers.deletedAt)))
      .where(and(isNull(expenses.deletedAt), ne(expenses.category, SETTLEMENT_CATEGORY)))
      .groupBy(expenses.groupId, expenses.currency)
    const spent: Record<string, SpentInCurrency[]> = {}
    for (const row of rows) (spent[row.groupId] ??= []).push({ currency: row.currency, totalMinor: Number(row.totalMinor) })
    for (const list of Object.values(spent)) list.sort((a, b) => a.currency.localeCompare(b.currency))
    return spent
  },
}
