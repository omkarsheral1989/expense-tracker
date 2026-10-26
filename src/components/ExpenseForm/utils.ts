import type { FormInstance } from 'antd'
import { RECENT_CURRENCY_COUNT } from '../../services/expenseService/constants.ts'
import type { CreateExpenseErrors } from '../../services/expenseService/types.ts'
import { moneyService } from '../../services/moneyService'
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
 * Whether the form differs from what it opened with (`initial`): something was
 * typed, picked or taken off. Used to decide if leaving needs a "Discard"
 * confirmation. Spaces around the description and notes do not count, and an
 * amount counts by its value ("10" is "10.00").
 */
export function hasUnsavedInput(
  values: Partial<FormValues> | undefined,
  initial: FormValues,
): boolean {
  if (!values) return false

  const ids = (receipts: readonly { id: string }[] | undefined) => (receipts ?? []).map((receipt) => receipt.id).join()
  return (
    (values.description ?? '').trim() !== initial.description.trim() ||
    moneyService.toMinor(values.amount ?? '', values.currency ?? initial.currency) !==
      moneyService.toMinor(initial.amount, initial.currency) ||
    (values.notes ?? '').trim() !== initial.notes.trim() ||
    values.category !== initial.category ||
    values.currency !== initial.currency ||
    values.date !== initial.date ||
    (values.receipts ?? []).length !== initial.receipts.length ||
    ids(values.keptReceipts) !== ids(initial.keptReceipts) ||
    (values.split !== undefined && !sameSplit(values.split, initial.split)) ||
    (values.accountId ?? null) !== (initial.accountId ?? null) ||
    (values.charged ?? '') !== (initial.charged ?? '')
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
