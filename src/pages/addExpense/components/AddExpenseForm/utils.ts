import type { FormInstance } from 'antd'
import { RECENT_CURRENCY_COUNT } from '../../../../services/expenseService/constants.ts'
import type { CreateExpenseErrors } from '../../../../services/expenseService/types.ts'
import type { GroupDetails } from '../../../../services/groupService/types.ts'
import { moneyService } from '../../../../services/moneyService'
import { sameSplit } from './SplitField/utils.ts'
import type { ExpenseDraft, FormValues } from './types.ts'

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

/**
 * What the form starts with after the expense was moved to another group: the
 * fields the user had entered, with the defaults of the new group for the rest.
 * The split is the new group's default (the user paid, split equally between its
 * members), since the members differ. The currency follows the new group's
 * default unless the user had picked another one, and the amount keeps to its
 * decimals.
 */
export function carriedOver(draft: ExpenseDraft, defaults: FormValues, group: GroupDetails): FormValues {
  const currency = draft.currency === draft.fromDefaultCurrency ? group.defaultCurrency : draft.currency
  return {
    ...defaults,
    description: draft.description,
    category: draft.category,
    amount: moneyService.convertInput(draft.amount, currency),
    currency,
    date: draft.date,
    notes: draft.notes,
    receipts: draft.receipts,
  }
}
