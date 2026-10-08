import type { FormInstance } from 'antd'
import { RECENT_CURRENCY_COUNT } from '../../../../services/expenseService/constants.ts'
import type { CreateExpenseErrors } from '../../../../services/expenseService/types.ts'
import { sameSplit } from './SplitField/utils.ts'
import type { FormValues } from './types.ts'

/** What `form.setFields` takes: a name and its messages for each field. */
type FieldData = Parameters<FormInstance['setFields']>[0][number]

const FIELDS = ['description', 'category', 'amount', 'currency', 'date', 'notes', 'split', 'receipts'] as const

/**
 * What the currency picker lists as "Recent": the group's default currency
 * first, then the user's most recently used ones, each once, at most three.
 */
export function recentCurrencyCodes(groupDefault: string, recent: readonly string[]): string[] {
  return [...new Set([groupDefault, ...recent])].slice(0, RECENT_CURRENCY_COUNT)
}

/**
 * Whether the user has typed or changed anything since the form opened. Used to
 * decide if leaving needs a "Discard this expense?" confirmation.
 */
export function hasUnsavedInput(
  values: Partial<FormValues> | undefined,
  initial: FormValues,
): boolean {
  if (!values) return false

  return (
    (values.description ?? '').trim() !== '' ||
    (values.amount ?? '') !== '' ||
    (values.notes ?? '').trim() !== '' ||
    values.category !== initial.category ||
    values.currency !== initial.currency ||
    values.date !== initial.date ||
    (values.receipts ?? []).length > 0 ||
    (values.split !== undefined && !sameSplit(values.split, initial.split))
  )
}

/**
 * Turns the service's messages into what the form needs: the message under each
 * field that has a problem, and no message under the others. The service names
 * the amount `amountMinor`; the form calls it `amount`, and shows problems with
 * who paid under the split.
 */
export function toFormFields(errors: CreateExpenseErrors): FieldData[] {
  const byField: Partial<Record<(typeof FIELDS)[number], string>> = {
    ...errors,
    amount: errors.amountMinor,
    // Who paid and the split share one place on the form.
    split: errors.split ?? errors.paidBy,
  }
  return FIELDS.map((name) => ({
    name,
    errors: byField[name] ? [byField[name]] : [],
  }))
}
