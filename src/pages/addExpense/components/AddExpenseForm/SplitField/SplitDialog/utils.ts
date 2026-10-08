import type { SplitMethod } from '../../../../../../db/types.ts'
import { computeShares } from '../../../../../../services/expenseService/utils.ts'
import { moneyService } from '../../../../../../services/moneyService'
import type { SplitValue } from '../../types.ts'
import type { SplitDraft, SplitSummary } from './types.ts'

/** The tabs of the dialog, in order, with the method each one sets. */
export const SPLIT_TABS: readonly SplitMethod[] = ['equal', 'exact', 'percent', 'shares', 'adjustment']

/** Methods whose entries are amounts of money. */
const MONEY_METHODS: readonly SplitMethod[] = ['exact', 'adjustment']

/** One entry per member for a tab: `entry(value)` for the split's own method, empty for the others. */
function entries(
  memberIds: readonly string[],
  split: SplitValue,
  method: SplitMethod,
  entry: (value: number) => string,
): Record<string, string> {
  return Object.fromEntries(
    memberIds.map((id) => {
      const value = split.method === method ? (split.values[id] ?? 0) : 0
      return [id, value > 0 ? entry(value) : '']
    }),
  )
}

/** The dialog's starting state for a split: its own tab filled in, the others empty (everyone ticked under Equally). */
export function draftFrom(split: SplitValue, memberIds: readonly string[], currency: string): SplitDraft {
  const money = (value: number) => moneyService.fromMinor(value, currency)
  return {
    paidBy: split.paidBy,
    method: split.method,
    equal: Object.fromEntries(
      memberIds.map((id) => [id, split.method === 'equal' ? (split.values[id] ?? 0) > 0 : true]),
    ),
    exact: entries(memberIds, split, 'exact', money),
    percent: entries(memberIds, split, 'percent', String),
    shares: entries(memberIds, split, 'shares', String),
    adjustment: entries(memberIds, split, 'adjustment', money),
  }
}

/** The numbers of the open tab, in the units `computeShares` takes (an empty entry is 0). */
export function splitFromDraft(draft: SplitDraft, currency: string): SplitValue {
  const { method } = draft
  let values: Record<string, number>
  if (method === 'equal') {
    values = Object.fromEntries(Object.entries(draft.equal).map(([id, ticked]) => [id, ticked ? 1 : 0]))
  } else if (MONEY_METHODS.includes(method)) {
    values = Object.fromEntries(
      Object.entries(draft[method]).map(([id, raw]) => [id, moneyService.toMinor(raw, currency) ?? 0]),
    )
  } else {
    values = Object.fromEntries(Object.entries(draft[method]).map(([id, raw]) => [id, Number(raw || 0)]))
  }
  return { paidBy: draft.paidBy, method, values }
}

/** "£2.00 left", "£0.00 left" (balanced) or "£1.00 over", for what is still to share out. */
function balanceOf(left: number, show: (value: number) => string): SplitSummary['balance'] {
  if (left < 0) return { text: `${show(-left)} over`, kind: 'over' }
  return { text: `${show(left)} left`, kind: left === 0 ? 'done' : 'left' }
}

/** The totals line of the open tab, for an expense of `amountMinor` (null while no amount is typed). */
export function summaryOf(draft: SplitDraft, amountMinor: number | null, currency: string): SplitSummary {
  const { values } = splitFromDraft(draft, currency)
  const sum = Object.values(values).reduce((total, value) => total + value, 0)
  const money = (value: number) => moneyService.format(value, currency)
  const amount = amountMinor ?? 0

  switch (draft.method) {
    case 'equal': {
      const people = `${sum} ${sum === 1 ? 'person' : 'people'}`
      if (sum === 0 || amountMinor === null) return { total: people }
      return { total: `${money(Math.floor(amount / sum))}/person (${people})` }
    }
    case 'exact':
    case 'adjustment':
      return { total: `${money(sum)} of ${money(amount)}`, balance: balanceOf(amount - sum, money) }
    case 'percent':
      return { total: `${sum}% of 100%`, balance: balanceOf(100 - sum, (value) => `${value}%`) }
    case 'shares':
      return { total: `${sum} ${sum === 1 ? 'share' : 'shares'} in all` }
  }
}

/**
 * Why the dialog's tick cannot accept the split, or null when it can. Amounts
 * of money can only be checked against the expense's amount, so they need one.
 */
export function draftProblem(
  draft: SplitDraft,
  amountMinor: number | null,
  memberIds: readonly string[],
  currency: string,
): string | null {
  if (MONEY_METHODS.includes(draft.method) && !amountMinor) return 'Enter the amount first.'
  const split = splitFromDraft(draft, currency)
  const result = computeShares(amountMinor ?? 0, split, split.paidBy, memberIds)
  return result.ok ? null : result.message
}

/** What each member's part would come to with the open tab, or null while the split does not work. */
export function previewOf(
  draft: SplitDraft,
  amountMinor: number | null,
  memberIds: readonly string[],
  currency: string,
): Record<string, number> | null {
  if (!amountMinor) return null
  const split = splitFromDraft(draft, currency)
  const result = computeShares(amountMinor, split, split.paidBy, memberIds)
  if (!result.ok) return null
  return Object.fromEntries(result.shares.map((share) => [share.personId, share.owedMinor]))
}
