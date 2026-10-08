import type { SplitMethod } from '../../../../../../db/types.ts'

/**
 * What the split dialog holds while the user works in it. Each tab keeps its
 * own entries, by person id, so switching tabs loses nothing: ticks for
 * 'equal', amounts as typed and cleaned ('12.5') for 'exact' and 'adjustment',
 * whole numbers as typed ('25') for 'percent' and 'shares'.
 */
export type SplitDraft = {
  paidBy: string
  /** The open tab, which is the method the split will use. */
  method: SplitMethod
  equal: Record<string, boolean>
  exact: Record<string, string>
  percent: Record<string, string>
  shares: Record<string, string>
  adjustment: Record<string, string>
}

/** The line at the bottom of the dialog: a total, and how much is left or over. */
export type SplitSummary = {
  /** Such as "£8.00 of £10.00", "75% of 100%", "£3.33/person" or "4 shares in all". */
  total: string
  /** Such as "£2.00 left" or "5% over"; absent for methods with nothing to balance. */
  balance?: { text: string; kind: 'left' | 'done' | 'over' }
}
