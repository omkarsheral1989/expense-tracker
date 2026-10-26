import { useState } from 'react'
import { ExpenseForm, type SaveOutcome } from '../../../../components/ExpenseForm'
import type { FormValues } from '../../../../components/ExpenseForm/types.ts'
import { GroupSwitcher } from '../../../../components/GroupSwitcher'
import { getDb } from '../../../../db/client.ts'
import { ROUTES } from '../../../../routes.ts'
import { accountService } from '../../../../services/accountService'
import type { AccountSummary, PaymentMethod, PaymentMethodInput } from '../../../../services/accountService/types.ts'
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
  /** The user's accounts, for the payment method. */
  accounts: AccountSummary[]
  /** The payment method this device has for the expense, or null. */
  paymentMethod: PaymentMethod | null
}

/**
 * Editing an expense: the shared expense form, opened with the expense's
 * saved values. The group stays the expense's own, so it is shown as a plain
 * label. Saving with nothing changed just goes back.
 */
export function EditExpenseForm({ group, expense, datasetId, userId, recentCurrencies, accounts, paymentMethod }: Props) {
  const [initialValues] = useState<FormValues>(() => ({
    description: expense.description,
    category: expense.category,
    amount: moneyService.fromMinor(expense.amountMinor, expense.currency),
    currency: expense.currency,
    date: expense.date,
    notes: expense.notes ?? '',
    split: { paidBy: expense.paidBy, method: expense.split.method, values: { ...expense.split.values } },
    accountId: paymentMethod?.accountId ?? null,
    charged:
      paymentMethod?.chargedMinor != null ? moneyService.fromMinor(paymentMethod.chargedMinor, paymentMethod.accountCurrency) : '',
    receipts: [],
    keptReceipts: expense.receipts,
  }))
  const expensePage = ROUTES.expense(group.id, expense.id)

  async function save(input: CreateExpenseInput, nextPaymentMethod: PaymentMethodInput | null): Promise<SaveOutcome> {
    const db = await getDb()
    const result = await expenseService.updateExpense(db, userId, group.id, expense.id, input)
    if (result.ok) {
      // The payment method is the user's own, saved apart from the shared expense, which is already saved.
      const payment = await accountService.setPaymentMethod(db, userId, expense.id, nextPaymentMethod).catch(() => null)
      if (!payment || !payment.ok) {
        return { status: 'saved', message: "Expense updated, but the payment method couldn't be saved. Edit it again to retry." }
      }
      return { status: 'saved', message: result.changed || payment.changed ? 'Expense updated.' : undefined }
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
      accounts={accounts}
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
