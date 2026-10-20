import type { SplitSummary } from './types.ts'

type BalanceKind = NonNullable<SplitSummary['balance']>['kind']

/** The Ant Design text type of "… left" (balanced is green, over is red). Every kind must have an entry. */
export const BALANCE_TEXT_TYPE: Record<BalanceKind, 'secondary' | 'success' | 'danger'> = {
  left: 'secondary',
  done: 'success',
  over: 'danger',
}
