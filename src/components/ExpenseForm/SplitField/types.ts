import type { SplitValue } from '../types.ts'

/** One of the ready-made choices offered when the group has exactly two members. */
export type QuickChoice = {
  /** What the choice says, such as "You paid, split equally". */
  label: string
  value: SplitValue
}
