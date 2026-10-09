import { CATEGORY_GROUPS, DEFAULT_CATEGORY } from './constants.ts'
import type { Category, CategoryKey, SplitInput, SplitResult } from './types.ts'

/** Most shares one person can be given with the "shares" method. */
const MAX_SHARES = 1000

/** Shown when the parts of a split do not come to the expense's amount (or 100%). */
export const SPLIT_DOES_NOT_ADD_UP = 'The split no longer adds up.'

/**
 * Works out every member's part of an expense from what the user entered for
 * the split method, in whole minor units:
 * - 'equal': 1 for each person in the split, 0 for the others; the amount is
 *   divided equally between those with 1.
 * - 'exact': each person's amount in minor units; they must add up to the amount.
 * - 'percent': whole percentages that add up to 100.
 * - 'shares': whole numbers of shares (0 to 1000, at least one in all); the
 *   amount is divided in proportion.
 * - 'adjustment': an extra amount in minor units for each person, together at
 *   most the amount; what remains is divided equally between every member and
 *   each person's extra is added to their part.
 * Parts that do not divide evenly leave a few minor units over; they go to the
 * payer's part, even when the payer is not in the split, so the parts always
 * add up to the amount. The payer paid all of it. Every member gets a share,
 * with what was entered for them as `inputValue` (0 when nothing was).
 */
export function computeShares(
  amountMinor: number,
  split: SplitInput,
  payerId: string,
  memberIds: readonly string[],
): SplitResult {
  if (!memberIds.includes(payerId)) return { ok: false, message: 'Choose who paid.' }
  if (Object.keys(split.values).some((personId) => !memberIds.includes(personId))) {
    return { ok: false, message: 'Only members of the group can be in the split.' }
  }

  const values = memberIds.map((personId) => split.values[personId] ?? 0)
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    return { ok: false, message: 'Use whole numbers of 0 or more.' }
  }
  const total = values.reduce((sum, value) => sum + value, 0)

  let owed: number[]
  switch (split.method) {
    case 'equal': {
      if (values.some((value) => value > 1)) return { ok: false, message: SPLIT_DOES_NOT_ADD_UP }
      if (total === 0) return { ok: false, message: 'Choose at least one person.' }
      const each = Math.floor(amountMinor / total)
      owed = values.map((value) => value * each)
      break
    }
    case 'exact':
      if (total !== amountMinor) return { ok: false, message: SPLIT_DOES_NOT_ADD_UP }
      owed = values
      break
    case 'percent':
      if (total !== 100) return { ok: false, message: SPLIT_DOES_NOT_ADD_UP }
      owed = values.map((value) => Math.floor((amountMinor * value) / 100))
      break
    case 'shares':
      if (values.some((value) => value > MAX_SHARES)) {
        return { ok: false, message: `Use at most ${MAX_SHARES} shares each.` }
      }
      if (total === 0) return { ok: false, message: 'Give at least one share.' }
      owed = values.map((value) => Math.floor((amountMinor * value) / total))
      break
    case 'adjustment': {
      if (total > amountMinor) return { ok: false, message: SPLIT_DOES_NOT_ADD_UP }
      const each = Math.floor((amountMinor - total) / memberIds.length)
      owed = values.map((value) => each + value)
      break
    }
  }

  const leftOver = amountMinor - owed.reduce((sum, part) => sum + part, 0)
  return {
    ok: true,
    shares: memberIds.map((personId, index) => ({
      personId,
      paidMinor: personId === payerId ? amountMinor : 0,
      owedMinor: owed[index] + (personId === payerId ? leftOver : 0),
      inputValue: values[index],
    })),
  }
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
