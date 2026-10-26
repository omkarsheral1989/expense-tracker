import { Flex } from 'antd'
import { useParams } from 'react-router'
import { CenteredMessage } from '../../components/CenteredMessage'
import { LoadingMessage } from '../../components/LoadingMessage'
import { LoadError } from '../../components/LoadError'
import { ROUTES } from '../../routes.ts'
import { ExpenseNotFound } from '../../components/ExpenseNotFound'
import { useCachedData } from '../../hooks/useCachedData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { aboveScreenEdge, belowStatusBar, HEADER_TOP_PADDING } from '../../theme/safeArea.ts'
import { EditExpenseForm } from './components/EditExpenseForm'
import { EDIT_EXPENSE_PAGE, editExpenseKey, loadExpenseToEdit } from './utils.ts'

/** A column about 560 px wide, centered, like the add-expense page. */
const COLUMN_STYLE = { width: '100%', maxWidth: 560, margin: '0 auto', padding: `${belowStatusBar(HEADER_TOP_PADDING)} 16px ${aboveScreenEdge(24)}` } as const

/** Where any member of a group edits one of its expenses. */
export function EditExpensePage() {
  const user = useCurrentUser()
  const { id = '', expenseId = '' } = useParams()

  const userId = user?.personId ?? ''
  const datasetId = user?.datasetId ?? ''
  // Read when the expense's page opened (ADR-055), so the form usually opens at once.
  const { state, retry } = useCachedData(() => loadExpenseToEdit(userId, id, expenseId), EDIT_EXPENSE_PAGE, editExpenseKey(userId, id, expenseId))

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  if (state.status === 'loading') return <LoadingMessage label="Loading the expense" />

  // A message (couldn't load, expense not found) is centered on the screen; the
  // form sits in the column.
  if (state.status === 'error') {
    return (
      <CenteredMessage>
        <LoadError title="Couldn't load this expense" onRetry={retry} error={state.status === 'error' ? state.error : undefined} backTo={ROUTES.expense(id, expenseId)} />
      </CenteredMessage>
    )
  }

  if (state.status === 'ready' && !state.data) {
    return (
      <CenteredMessage>
        <title>Expense not found · OwnLedger</title>
        <ExpenseNotFound groupId={id} />
      </CenteredMessage>
    )
  }

  return (
    <Flex vertical style={COLUMN_STYLE}>
      {state.status === 'ready' && state.data ? (
        <EditExpenseForm
          key={state.data.expense.id}
          group={state.data.group}
          expense={state.data.expense}
          datasetId={datasetId}
          userId={userId}
          recentCurrencies={state.data.recentCurrencies}
          accounts={state.data.accounts}
          paymentMethod={state.data.paymentMethod}
        />
      ) : null}
    </Flex>
  )
}
