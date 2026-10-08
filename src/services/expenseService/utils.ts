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
