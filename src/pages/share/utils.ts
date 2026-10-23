import type { SharedItems } from '../../pwa/sharedFiles.ts'
import type { ExpenseDraft } from '../addExpense/components/AddExpenseForm/types.ts'
import { expenseService } from '../../services/expenseService'
import { dateService } from '../../services/dateService'

/** The shared pictures as files, the way the receipts field holds them. */
export function pictureFiles(items: SharedItems): File[] {
  return items.pictures.map((picture) => new File([picture.bytes], picture.name, { type: picture.type }))
}

/**
 * The add-expense form's carry-over (the same one the group switcher uses) for
 * a share: the pictures as receipts and the shared text as notes, everything
 * else at its defaults. The currency is left as "the group's default", which
 * the form fills in from the group it opens for.
 */
export function draftFromShare(items: SharedItems): ExpenseDraft {
  return {
    description: '',
    category: expenseService.defaultCategory,
    amount: '',
    currency: '',
    fromDefaultCurrency: '',
    date: dateService.toDay(new Date()),
    notes: items.notes,
    receipts: pictureFiles(items),
  }
}
