import { expenseService } from '../../services/expenseService'
import { moneyService } from '../../services/moneyService'
import { groupService } from '../../services/groupService'
import type { ActivityItem } from '../../services/activityService/types.ts'

/** The verb of an event in a row's sentence. */
const VERBS = { added: 'added', edited: 'edited', deleted: 'deleted', restored: 'restored', reverted: 'restored a version of' } as const

/** Who did it, as a row starts: "You", or first name (their email's start when no name is known). */
export function actorName(by: ActivityItem['by']): string {
  return by.isYou ? 'You' : groupService.shortName(by)
}

/**
 * A row's sentence: "Priya edited Beach shack dinner"; for a payment
 * "Priya added a payment: Priya paid you £45.50" (PRD 5.18).
 */
export function activitySentence(item: ActivityItem): string {
  const verb = VERBS[item.entry.kind]
  const who = actorName(item.by)
  if (!item.payment) return `${who} ${verb} ${item.description}`
  const paid = `${expenseService.settlementSentence(item.payment.payer, item.payment.recipient)} ${moneyService.format(item.amountMinor, item.currency)}`
  return `${who} ${verb === 'restored a version of' ? 'restored a version of a payment' : `${verb} a payment`}: ${paid}`
}

/** A row's second line: the group's name, and for an expense its amount after the event. */
export function activityDetail(item: ActivityItem): string {
  if (item.payment) return item.groupName
  return `${item.groupName} · ${moneyService.format(item.amountMinor, item.currency)}`
}

/** Another member's event that reached this device after the user last left the page (PRD 5.18). */
export function isNewItem(item: ActivityItem, seenAt: Date | null): boolean {
  if (item.by.isYou || !item.arrivedAt) return false
  return seenAt === null || item.arrivedAt > seenAt
}
