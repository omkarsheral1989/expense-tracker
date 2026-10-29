import { getDb } from '../../db/client.ts'
import { balancesService } from '../../services/balancesService'
import type { BalanceMember, GroupBalances } from '../../services/balancesService/types.ts'
import { groupService } from '../../services/groupService'
import { moneyService } from '../../services/moneyService'
import type { BalanceLine, PersonTotal, SettlePrefill } from './types.ts'

/** The name of the balances page's remembered data (`useCachedData`'s `page`). */
export const BALANCES_PAGE = 'balances'

/** The key of one group's balances for one user. */
export const balancesKey = (userId: string, groupId: string) => `${userId}:${groupId}`

/** What the balances page shows; null when the user cannot see the group. */
export async function loadBalances(userId: string, groupId: string) {
  return balancesService.groupBalances(await getDb(), userId, groupId)
}

/** How a member heads their sentence: "You", or their first name. */
export function subjectName(member: BalanceMember): string {
  return member.isYou ? 'You' : groupService.shortName(member)
}

/** How a member is named inside a sentence: "you", or their first name. */
export function objectName(member: BalanceMember): string {
  return member.isYou ? 'you' : groupService.shortName(member)
}

/** The members in the order of the page: the user first, then the others A to Z by name shown. */
export function orderedMembers(members: readonly BalanceMember[]): BalanceMember[] {
  const label = (member: BalanceMember) => groupService.displayName(member).toLowerCase()
  return members.toSorted((a, b) => Number(b.isYou) - Number(a.isYou) || label(a).localeCompare(label(b)) || a.personId.localeCompare(b.personId))
}

/** A person's total in each currency (largest first only by the currency order the service gave); empty when settled up. */
export function totalsOf(balances: GroupBalances, personId: string): PersonTotal[] {
  return balances.currencies.flatMap(({ currency, nets }) => {
    const net = nets.find((one) => one.personId === personId)
    return net ? [{ currency, netMinor: net.netMinor }] : []
  })
}

/** The payments of the person's point of view: what they get back from whom, and what they owe to whom. */
export function linesOf(balances: GroupBalances, personId: string): BalanceLine[] {
  return balances.currencies.flatMap(({ currency, transfers }) =>
    transfers.flatMap((transfer): BalanceLine[] => {
      if (transfer.toId === personId) return [{ currency, kind: 'getsBack', otherId: transfer.fromId, amountMinor: transfer.amountMinor }]
      if (transfer.fromId === personId) return [{ currency, kind: 'owes', otherId: transfer.toId, amountMinor: transfer.amountMinor }]
      return []
    }),
  )
}

/**
 * The sentence of a collapsed row: "Omkar gets back $22 in total", "Priya owes $11 in total", or, with balances in several
 * currencies, "Omkar gets back $22 and owes ₹100 in total". "Rima is settled up" with nothing owed.
 */
export function summaryOf(member: BalanceMember, totals: readonly PersonTotal[]): string {
  const name = subjectName(member)
  if (totals.length === 0) return `${name} ${member.isYou ? 'are' : 'is'} settled up`
  const amounts = (positive: boolean) =>
    totals
      .filter((total) => total.netMinor > 0 === positive)
      .map((total) => moneyService.format(Math.abs(total.netMinor), total.currency))
      .join(' and ')
  const gets = amounts(true)
  const owes = amounts(false)
  const getsBack = member.isYou ? 'get back' : 'gets back'
  const owe = member.isYou ? 'owe' : 'owes'
  const parts = [gets && `${getsBack} ${gets}`, owes && `${owe} ${owes}`].filter(Boolean)
  return `${name} ${parts.join(' and ')} in total`
}

/** One line of an open row: "Omkar gets back $11 from Priya", "Omkar owes $1 to Rima" ("You owe $1 to Rima"). */
export function lineText(member: BalanceMember, other: BalanceMember, line: BalanceLine): string {
  const amount = moneyService.format(line.amountMinor, line.currency)
  const name = subjectName(member)
  if (line.kind === 'getsBack') return `${name} ${member.isYou ? 'get back' : 'gets back'} ${amount} from ${objectName(other)}`
  return `${name} ${member.isYou ? 'owe' : 'owes'} ${amount} to ${objectName(other)}`
}

/** The payment that would settle a line: whoever owes pays the other. */
export function prefillOf(member: BalanceMember, line: BalanceLine): SettlePrefill {
  const memberPays = line.kind === 'owes'
  return {
    payerId: memberPays ? member.personId : line.otherId,
    recipientId: memberPays ? line.otherId : member.personId,
    amountMinor: line.amountMinor,
    currency: line.currency,
  }
}

/**
 * The payment Settle up opens with, read from the router state it was given; null for anything else (a direct link, a payer who is
 * the recipient, a person who is not a member, an amount that is not a positive whole number), so a state from elsewhere is never
 * trusted.
 */
export function settlePrefillFrom(state: unknown, memberIds: readonly string[]): SettlePrefill | null {
  const value = (state as { settle?: Partial<SettlePrefill> } | null)?.settle
  if (!value) return null
  const { payerId, recipientId, amountMinor, currency } = value
  if (typeof payerId !== 'string' || typeof recipientId !== 'string' || typeof currency !== 'string') return null
  if (typeof amountMinor !== 'number' || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) return null
  if (payerId === recipientId || !memberIds.includes(payerId) || !memberIds.includes(recipientId)) return null
  return { payerId, recipientId, amountMinor, currency }
}
