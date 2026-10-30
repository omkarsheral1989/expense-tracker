import type { PersonBalance } from '../expenseService/types.ts'
import { displayName } from '../groupService/utils.ts'
import type { GroupBalances, Transfer } from './types.ts'

/**
 * The payments that settle a group's debts, from each person's net (positive: owed, negative: owes). The biggest debtor pays the
 * biggest creditor as much as they can, and so on until everyone is square, so nobody both pays and receives. Ties are broken by
 * the person id, so every device finds the same payments. Nets that do not add up to zero (they always do for real expenses)
 * leave the remainder unmatched.
 */
export function simplifyDebts(nets: readonly { personId: string; netMinor: number }[]): Transfer[] {
  const bigFirst = (a: { left: number; personId: string }, b: { left: number; personId: string }) =>
    b.left - a.left || a.personId.localeCompare(b.personId)
  const creditors = nets.filter((net) => net.netMinor > 0).map((net) => ({ personId: net.personId, left: net.netMinor })).sort(bigFirst)
  const debtors = nets.filter((net) => net.netMinor < 0).map((net) => ({ personId: net.personId, left: -net.netMinor })).sort(bigFirst)
  const transfers: Transfer[] = []

  while (creditors.length > 0 && debtors.length > 0) {
    const creditor = creditors[0]
    const debtor = debtors[0]
    const amountMinor = Math.min(creditor.left, debtor.left)
    transfers.push({ fromId: debtor.personId, toId: creditor.personId, amountMinor })
    creditor.left -= amountMinor
    debtor.left -= amountMinor
    if (creditor.left === 0) creditors.shift()
    if (debtor.left === 0) debtors.shift()
    creditors.sort(bigFirst)
    debtors.sort(bigFirst)
  }
  return transfers
}

/**
 * The payments of `balances` that involve the user, one entry per person and currency, in the order of the people's names and then
 * currency codes. Positive amounts are owed to the user.
 */
export function userBalancesFrom(balances: GroupBalances, userId: string): PersonBalance[] {
  const byId = new Map(balances.members.map((member) => [member.personId, member]))
  const label = (person: { name: string | null; email: string | null }) => displayName(person).toLowerCase()
  return balances.currencies
    .flatMap(({ currency, transfers }) =>
      transfers.flatMap((transfer): PersonBalance[] => {
        const sign = transfer.toId === userId ? 1 : transfer.fromId === userId ? -1 : 0
        const other = byId.get(sign === 1 ? transfer.fromId : transfer.toId)
        if (sign === 0 || !other) return []
        return [{ personId: other.personId, email: other.email, name: other.name, currency, amountMinor: sign * transfer.amountMinor }]
      }),
    )
    .sort((a, b) => label(a).localeCompare(label(b)) || a.personId.localeCompare(b.personId) || a.currency.localeCompare(b.currency))
}
