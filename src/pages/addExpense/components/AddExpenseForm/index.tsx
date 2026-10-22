import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ExpenseForm, type SaveOutcome } from '../../../../components/ExpenseForm'
import { initialSplit } from '../../../../components/ExpenseForm/SplitField/utils.ts'
import type { FormValues } from '../../../../components/ExpenseForm/types.ts'
import { GroupSwitcher } from '../../../../components/GroupSwitcher'
import { getDb } from '../../../../db/client.ts'
import { ROUTES } from '../../../../routes.ts'
import { dateService } from '../../../../services/dateService'
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
export function AddExpenseForm({ group, datasetId, userId, recentCurrencies, groups, draft }: Props) {
  const navigate = useNavigate()

  const [initialValues] = useState<FormValues>(() => ({
    description: '',
    category: expenseService.defaultCategory,
    amount: '',
    currency: group.defaultCurrency,
    date: dateService.toDay(new Date()),
    notes: '',
    split: initialSplit(group.members),
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
      fromDefaultCurrency: group.defaultCurrency,
    }
    navigate(ROUTES.newExpense(groupId), { replace: true, state: { draft: carried } })
  }

  async function save(input: CreateExpenseInput): Promise<SaveOutcome> {
    const result = await expenseService.createExpense(await getDb(), userId, group.id, input)
    return result.ok ? { status: 'saved', message: 'Expense added.' } : { status: 'invalid', errors: result.errors }
  }

  return (
    <ExpenseForm
      group={group}
      datasetId={datasetId}
      recentCurrencies={recentCurrencies}
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
