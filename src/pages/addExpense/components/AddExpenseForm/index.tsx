import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { refreshGroupPage } from '../../../group/utils.ts'
import { useAppNavigate } from '../../../../hooks/useAppNavigate'
import { ExpenseForm, type SaveOutcome } from '../../../../components/ExpenseForm'
import { initialSplit } from '../../../../components/ExpenseForm/SplitField/utils.ts'
import type { FormValues } from '../../../../components/ExpenseForm/types.ts'
import { GroupSwitcher } from '../../../../components/GroupSwitcher'
import { getDb } from '../../../../db/client.ts'
import { ROUTES } from '../../../../routes.ts'
import { dateService } from '../../../../services/dateService'
import { accountService } from '../../../../services/accountService'
import type { AccountSummary, PaymentMethodInput } from '../../../../services/accountService/types.ts'
import { expenseService } from '../../../../services/expenseService'
import type { CreateExpenseInput } from '../../../../services/expenseService/types.ts'
import type { GroupDetails, GroupSummary } from '../../../../services/groupService/types.ts'
import type { ExpenseDraft } from './types.ts'
import { carriedOver } from './utils.ts'

type Props = {
  group: GroupDetails
  /** Names the device's photo store, where receipt photos are kept. */
  datasetId: string
  /** The user's person id: they pay, and the expense is saved as theirs. */
  userId: string
  /** The currencies of the user's latest expenses, most recent first. */
  recentCurrencies: string[]
  /** The user's accounts, for the payment method. */
  accounts: AccountSummary[]
  /** Every group of the user, for moving the expense to another one. */
  groups: readonly GroupSummary[]
  /** Fields carried over from another group when the user switched; leave out for a new form. */
  draft?: ExpenseDraft
}

/**
 * A new expense in a group: the shared expense form with its defaults (the
 * user paid, split equally) or the fields carried over from another group,
 * and a switcher to move the expense to another group.
 */
export function AddExpenseForm({ group, datasetId, userId, recentCurrencies, accounts, groups, draft }: Props) {
  const navigate = useAppNavigate()
  const queryClient = useQueryClient()

  const [initialValues] = useState<FormValues>(() => ({
    description: '',
    category: expenseService.defaultCategory,
    amount: '',
    currency: group.defaultCurrency,
    date: dateService.toDay(new Date()),
    notes: '',
    split: initialSplit(group.members),
    accountId: null,
    charged: '',
    receipts: [],
  }))
  // What the form shows at first: the defaults, or what was carried over from
  // the group the user switched from (with a new split: the members differ).
  // `initialValues` stays the plain defaults, so carried fields count as input.
  const [startValues] = useState<FormValues | undefined>(() =>
    draft ? carriedOver(draft, initialValues, group) : undefined,
  )

  // Moves the expense to another group, keeping what was entered. The address
  // changes to that group's add-expense page, with the fields in its state.
  function switchGroup(readValues: () => FormValues, groupId: string) {
    const values = readValues()
    const carried: ExpenseDraft = {
      description: values.description,
      category: values.category,
      amount: values.amount,
      currency: values.currency,
      date: values.date,
      notes: values.notes,
      receipts: values.receipts,
      accountId: values.accountId,
      charged: values.charged,
      fromDefaultCurrency: group.defaultCurrency,
    }
    navigate(ROUTES.newExpense(groupId), { replace: true, state: { draft: carried } })
  }

  async function save(input: CreateExpenseInput, paymentMethod: PaymentMethodInput | null): Promise<SaveOutcome> {
    const db = await getDb()
    const result = await expenseService.createExpense(db, userId, group.id, input)
    if (!result.ok) return { status: 'invalid', errors: result.errors }
    // The payment method is the user's own, saved apart from the shared expense, which is already saved.
    let paymentSaved = true
    if (paymentMethod) {
      paymentSaved = await accountService
        .setPaymentMethod(db, userId, result.expenseId, paymentMethod)
        .then((outcome) => outcome.ok)
        .catch(() => false)
    }
    // The group page comes back with the expense already on it, so the way back is not cut short (PRD 5.16).
    await refreshGroupPage(queryClient, userId, group.id)
    return {
      status: 'saved',
      message: paymentSaved ? 'Expense added.' : "Expense added, but the payment method couldn't be saved. Edit the expense to add it.",
    }
  }

  return (
    <ExpenseForm
      group={group}
      datasetId={datasetId}
      recentCurrencies={recentCurrencies}
      accounts={accounts}
      heading="Add expense"
      initialValues={initialValues}
      startValues={startValues}
      renderGroupPicker={(readValues) => (
        <GroupSwitcher group={group} groups={groups} onSwitch={(groupId) => switchGroup(readValues, groupId)} />
      )}
      discardPrompt={{ title: 'Discard this expense?', content: 'What you entered will be lost.' }}
      leaveTo={ROUTES.group(group.id)}
      failureMessage="Couldn't add the expense. Please try again."
      onSave={save}
    />
  )
}
