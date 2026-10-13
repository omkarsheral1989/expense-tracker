import type { ExpenseShareDetails } from '../../../../services/expenseService/types.ts'
import { moneyService } from '../../../../services/moneyService'

/** How the page names a person: "You", or their name (their email when no name is known). */
export function displayName(person: { isYou: boolean; name: string | null; email: string }): string {
  return person.isYou ? 'You' : (person.name ?? person.email)
}

/**
 * One person's part as a sentence: "You paid £9.00 and owe £3.00", "Priya
 * Shah owes £6.00" or "sam@gmail.com paid £9.00".
 */
export function shareSentence(share: ExpenseShareDetails, currency: string): string {
  const name = displayName(share)
  const paid = moneyService.format(share.paidMinor, currency)
  const owed = moneyService.format(share.owedMinor, currency)
  const owe = share.isYou ? 'owe' : 'owes'

  if (share.paidMinor > 0 && share.owedMinor > 0) return `${name} paid ${paid} and ${owe} ${owed}`
  if (share.paidMinor > 0) return `${name} paid ${paid}`
  return `${name} ${owe} ${owed}`
}
