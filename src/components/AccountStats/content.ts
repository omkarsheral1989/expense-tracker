import type { SpendTargetPeriod } from '../../db/types.ts'

/** How a spend target's period reads in "per month" and "this month". Every period must have an entry. */
export const SPEND_TARGET_LABELS: Record<SpendTargetPeriod, { per: string; this: string }> = {
  month: { per: 'per month', this: 'this month' },
  quarter: { per: 'per quarter', this: 'this quarter' },
}
