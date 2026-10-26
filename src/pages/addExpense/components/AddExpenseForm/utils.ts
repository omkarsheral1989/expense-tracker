import type { FormValues } from '../../../../components/ExpenseForm/types.ts'
import type { GroupDetails } from '../../../../services/groupService/types.ts'
import { moneyService } from '../../../../services/moneyService'
import type { ExpenseDraft } from './types.ts'

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
    accountId: draft.accountId,
    charged: draft.charged,
  }
}
