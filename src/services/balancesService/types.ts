/** A member as the balances page names and draws them. */
export type BalanceMember = {
  personId: string
  email: string | null
  name: string | null
  /** The address of their Google picture, once known (ADR-046). */
  picture: string | null
  isYou: boolean
}

/** One payment that would settle part of the group's debts: `fromId` pays `toId`. */
export type Transfer = { fromId: string; toId: string; amountMinor: number }

/** What a group's members owe each other in one currency (PRD 5.21). */
export type CurrencyBalances = {
  currency: string
  /** Each member's net: positive when they are owed, negative when they owe. Members who are settled are left out. */
  nets: { personId: string; netMinor: number }[]
  /** The fewest payments that settle everything, found by `simplifyDebts`. */
  transfers: Transfer[]
}

/** What the balances page shows about a group; one entry per currency that has an unsettled balance. */
export type GroupBalances = {
  groupId: string
  /** Every live member, plus anyone else who has a balance. */
  members: BalanceMember[]
  currencies: CurrencyBalances[]
  /** The user deleted the group on this device (ADR-069): its balances can be read, not settled. */
  deleted: boolean
}
