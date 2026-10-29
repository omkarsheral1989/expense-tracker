import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { expenseShares, expenses, people } from '../../db/schema.ts'
import { shownName } from '../../db/shownName.ts'
import { groupService } from '../groupService'
import type { BalanceMember, CurrencyBalances, GroupBalances } from './types.ts'
import { simplifyDebts } from './utils.ts'

export const balancesService = {
  /**
   * What the members of a group owe each other, per currency, with the fewest payments that settle it (PRD 5.21); null when the
   * user cannot see the group (unknown, deleted or not theirs, as `getGroup`). Worked out from the live shares each time, payments
   * between members included, and never converted between currencies.
   */
  async groupBalances(db: Database, userId: string, groupId: string): Promise<GroupBalances | null> {
    const group = await groupService.getGroup(db, userId, groupId)
    if (!group) return null

    const rows = await db
      .select({
        currency: expenses.currency,
        personId: expenseShares.personId,
        netMinor: sql<string>`sum(${expenseShares.paidMinor} - ${expenseShares.owedMinor})`,
      })
      .from(expenseShares)
      .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
      .where(and(eq(expenses.groupId, groupId), isNull(expenses.deletedAt), isNull(expenseShares.deletedAt)))
      .groupBy(expenses.currency, expenseShares.personId)

    // Everyone in the group, and anyone else who still has a balance (a person who is no longer a member).
    const known = new Set(group.members.map((member) => member.personId))
    const others = [...new Set(rows.map((row) => row.personId))].filter((id) => !known.has(id))
    const strangers = others.length
      ? await db
          .select({ personId: people.id, email: people.email, name: shownName(people), picture: people.picture })
          .from(people)
          .where(inArray(people.id, others))
      : []
    const members: BalanceMember[] = [
      ...group.members.map((member) => ({ personId: member.personId, email: member.email, name: member.name, picture: member.picture ?? null, isYou: member.isYou })),
      ...strangers.map((person) => ({ ...person, picture: person.picture ?? null, isYou: person.personId === userId })),
    ]

    const currencies: CurrencyBalances[] = [...new Set(rows.map((row) => row.currency))]
      .toSorted((a, b) => Number(b === group.defaultCurrency) - Number(a === group.defaultCurrency) || a.localeCompare(b))
      .map((currency) => {
        const nets = rows
          .filter((row) => row.currency === currency && Number(row.netMinor) !== 0)
          .map((row) => ({ personId: row.personId, netMinor: Number(row.netMinor) }))
        return { currency, nets, transfers: simplifyDebts(nets) }
      })
      .filter((one) => one.nets.length > 0)

    return { groupId: group.id, members, currencies }
  },
}
