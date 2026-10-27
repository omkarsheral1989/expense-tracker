import { groupService } from '../groupService'
import type { TotalsRow } from './types.ts'

/** A person's amount in a list, before it is sorted. */
type Entry = Omit<TotalsRow, 'amountMinor'> & { amountMinor: number }

/**
 * Largest amount first, ties by the name shown (the user is not put first: this is by amount). The rows of members who have
 * nothing come last, in the same order of name.
 */
export function sortRows(rows: Entry[]): TotalsRow[] {
  const label = (row: Entry) => groupService.displayName(row).toLowerCase()
  return rows.toSorted((a, b) => b.amountMinor - a.amountMinor || label(a).localeCompare(label(b)) || a.personId.localeCompare(b.personId))
}

/** The currencies with expenses, the group's default first and the rest A to Z. */
export function orderCurrencies(currencies: string[], defaultCurrency: string): string[] {
  return currencies.toSorted((a, b) => Number(b === defaultCurrency) - Number(a === defaultCurrency) || a.localeCompare(b))
}

/** A share of a total as a whole percent, 0 when there is no total. */
export function percentOf(amountMinor: number, totalMinor: number): number {
  return totalMinor > 0 ? Math.round((amountMinor / totalMinor) * 100) : 0
}
