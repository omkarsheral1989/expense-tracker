/** One member's amount in a donut and its list: what they owe, or what they paid. */
export type TotalsRow = {
  personId: string
  email: string | null
  name: string | null
  /** The address of their Google picture, once known (ADR-046). */
  picture: string | null
  isYou: boolean
  /** Integer minor units of the chosen currency; 0 for a member with nothing. */
  amountMinor: number
}

/** One currency's totals: what the group spent and how it splits (PRD 5.20). */
export type CurrencyTotals = {
  currency: string
  /** The sum of the expenses, payments between members left out. */
  totalMinor: number
  /** What each person owes of it, largest first, ties by name. Every member has a row. */
  shares: TotalsRow[]
  /** What each person paid of it, largest first, ties by name. Every member has a row. */
  paid: TotalsRow[]
}

/** What the totals page shows about a group, one entry per currency that has expenses, the group's default first. */
export type GroupTotals = {
  groupId: string
  name: string
  type: import('../../db/types.ts').GroupType
  defaultCurrency: string
  /** Empty while no expense counts. */
  currencies: CurrencyTotals[]
}
