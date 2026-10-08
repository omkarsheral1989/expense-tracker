import type { SplitMethod } from '../../../../db/types.ts'

/** How the details page names each split method. Every method must have an entry. */
export const SPLIT_METHOD_LABELS: Record<SplitMethod, string> = {
  equal: 'Split equally',
  exact: 'Split by exact amounts',
  percent: 'Split by percentages',
  shares: 'Split by shares',
  adjustment: 'Split by adjustment',
}
