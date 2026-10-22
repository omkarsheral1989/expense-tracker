import { useState } from 'react'
import { ExpenseForm, type SaveOutcome } from '../../../../components/ExpenseForm'
import type { FormValues } from '../../../../components/ExpenseForm/types.ts'
import { GroupSwitcher } from '../../../../components/GroupSwitcher'
import { getDb } from '../../../../db/client.ts'
import { ROUTES } from '../../../../routes.ts'
import { expenseService } from '../../../../services/expenseService'
import type { CreateExpenseInput, ExpenseToEdit } from '../../../../services/expenseService/types.ts'
import type { GroupDetails } from '../../../../services/groupService/types.ts'
import { moneyService } from '../../../../services/moneyService'

type Props = {
  group: GroupDetails
  /** The expense as it was saved: the form opens with it. */
  expense: ExpenseToEdit
  /** Names the device's photo store, where receipt photos are kept. */
  datasetId: string
  /** The user's person id: the edit is saved as theirs. */
  userId: string
  /** The currencies of the user's latest expenses, most recent first. */
  recentCurrencies: string[]
}

/**
 * Editing an expense: the shared expense form, opened with the expense's
 * saved values. The group stays the expense's own, so it is shown as a plain
 * label. Saving with nothing changed just goes back.
 */
export function EditExpenseForm({ group, expense, datasetId, userId, recentCurrencies }: Props) {
  const [initialValues] = useState<FormValues>(() => ({
    description: expense.description,
    category: expense.category,
    amount: moneyService.fromMinor(expense.amountMinor, expense.currency),
    currency: expense.currency,
    date: expense.date,
    notes: expense.notes ?? '',
    split: { paidBy: expense.paidBy, method: expense.split.method, values: { ...expense.split.values } },
    receipts: [],
    keptReceipts: expense.receipts,
  }))
  const expensePage = ROUTES.expense(group.id, expense.id)

  async function save(input: CreateExpenseInput): Promise<SaveOutcome> {
    const result = await expenseService.updateExpense(await getDb(), userId, group.id, expense.id, input)
    if (result.ok) {
      return { status: 'saved', message: result.changed ? 'Expense updated.' : undefined }
    }
    if ('notFound' in result) {
      return { status: 'gone', message: 'This expense is no longer available.', to: ROUTES.group(group.id) }
    }
    return { status: 'invalid', errors: result.errors }
  }

  return (
    <ExpenseForm
      group={group}
      datasetId={datasetId}
      recentCurrencies={recentCurrencies}
      heading="Edit expense"
      initialValues={initialValues}
      renderGroupPicker={() => <GroupSwitcher group={group} disabled />}
      discardPrompt={{ title: 'Discard your changes?', content: 'What you changed will be lost.' }}
      leaveTo={expensePage}
      failureMessage="Couldn't save the changes. Please try again."
      onSave={save}
    />
  )
}
