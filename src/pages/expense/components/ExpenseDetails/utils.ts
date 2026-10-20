import type { ExpenseShareDetails } from '../../../../services/expenseService/types.ts'
import { groupService } from '../../../../services/groupService'
import { moneyService } from '../../../../services/moneyService'

/** How the page names a person: "You", or their name (their email when no name is known). */
export function displayName(person: { isYou: boolean; name: string | null; email: string | null }): string {
  return person.isYou ? 'You' : groupService.displayName(person)
}

/** Who paid, as a sentence: "You paid £9.00" or "Priya Shah paid £9.00". */
export function paidSentence(share: ExpenseShareDetails, currency: string): string {
  return `${displayName(share)} paid ${moneyService.format(share.paidMinor, currency)}`
}

/** What one person owes, as a sentence: "You owe £3.00" or "Priya Shah owes £6.00". */
export function owedSentence(share: ExpenseShareDetails, currency: string): string {
  const owe = share.isYou ? 'owe' : 'owes'
  return `${displayName(share)} ${owe} ${moneyService.format(share.owedMinor, currency)}`
}
