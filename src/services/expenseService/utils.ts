import { CATEGORY_GROUPS, DEFAULT_CATEGORY } from './constants.ts'
import type { Category, CategoryKey, ShareAmounts } from './types.ts'

/**
 * Divides an amount equally between people, in whole minor units. When it does
 * not divide evenly, the few minor units left over go to the payer's share,
 * even when the payer is not one of the people splitting it, so the shares
 * always add up to the amount. Everyone listed in `splitBetween` gets an
 * `inputValue` of 1; a payer outside the split gets 0. The payer paid the whole
 * amount.
 */
export function splitEqually(
  amountMinor: number,
  splitBetween: readonly string[],
  payerId: string,
): ShareAmounts[] {
  if (splitBetween.length === 0) throw new Error('An expense must be split between at least one person.')

  const each = Math.floor(amountMinor / splitBetween.length)
  const leftOver = amountMinor - each * splitBetween.length

  const shares: ShareAmounts[] = splitBetween.map((personId) => ({
    personId,
    paidMinor: 0,
    owedMinor: each,
    inputValue: 1,
  }))
  let payer = shares.find((share) => share.personId === payerId)
  if (!payer) {
    payer = { personId: payerId, paidMinor: 0, owedMinor: 0, inputValue: 0 }
    shares.push(payer)
  }
  payer.paidMinor = amountMinor
  payer.owedMinor += leftOver
  return shares
}

/** Every category, group by group, in the order the picker shows them. */
export const CATEGORIES: readonly Category[] = CATEGORY_GROUPS.flatMap((group) =>
  group.categories.map((category) => ({
    key: category.key,
    label: category.label,
    group: group.key,
    groupLabel: group.label,
  })),
)

/** Whether `key` is one of the app's categories. */
export function isCategoryKey(key: string): key is CategoryKey {
  return CATEGORIES.some((category) => category.key === key)
}

/**
 * The category with this key. An unknown key (for example one synced from a
 * newer version of the app) is shown as the default category.
 */
export function categoryOf(key: string): Category {
  return (
    CATEGORIES.find((category) => category.key === key) ??
    (CATEGORIES.find((category) => category.key === DEFAULT_CATEGORY) as Category)
  )
}

/** One person's part in one expense, as the balance maths needs it. */
type SharePart = { personId: string; paidMinor: number; owedMinor: number }

/** Money one person owes another because of an expense. */
export type Debt = { from: string; to: string; amountMinor: number }

/**
 * Who owes whom because of one expense. Each person's net is what they paid
 * minus their share; those who are short pay those who are ahead, matched in
 * the order of the shares. With one payer (the only case the app creates) this
 * is simply: everyone else owes the payer their share.
 */
export function debtsOf(shares: readonly SharePart[]): Debt[] {
  const creditors = shares
    .map((share) => ({ personId: share.personId, left: share.paidMinor - share.owedMinor }))
    .filter((creditor) => creditor.left > 0)
  const debts: Debt[] = []

  for (const share of shares) {
    let owes = share.owedMinor - share.paidMinor
    for (const creditor of creditors) {
      if (owes <= 0) break
      if (creditor.left <= 0) continue
      const amountMinor = Math.min(owes, creditor.left)
      debts.push({ from: share.personId, to: creditor.personId, amountMinor })
      creditor.left -= amountMinor
      owes -= amountMinor
    }
  }
  return debts
}

/** What one other person and the user owe each other in one currency. */
export type PairBalance = {
  personId: string
  currency: string
  /** Positive: they owe the user. Negative: the user owes them. Never zero. */
  amountMinor: number
}

/**
 * The user's balance with each other person, per currency, from the shares of
 * many expenses. Debts between two other people are left out. Pairs that come
 * to zero are dropped.
 */
export function pairBalances(
  userId: string,
  expenses: readonly { currency: string; shares: readonly SharePart[] }[],
): PairBalance[] {
  const totals = new Map<string, PairBalance>()
  function add(personId: string, currency: string, amountMinor: number) {
    const key = `${personId}|${currency}`
    const total = totals.get(key) ?? { personId, currency, amountMinor: 0 }
    total.amountMinor += amountMinor
    totals.set(key, total)
  }

  for (const expense of expenses) {
    for (const debt of debtsOf(expense.shares)) {
      if (debt.to === userId) add(debt.from, expense.currency, debt.amountMinor)
      else if (debt.from === userId) add(debt.to, expense.currency, -debt.amountMinor)
    }
  }
  return [...totals.values()].filter((total) => total.amountMinor !== 0)
}
