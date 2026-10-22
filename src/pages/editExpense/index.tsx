import { Card, Flex, Skeleton } from 'antd'
import { useParams } from 'react-router'
import { CenteredMessage } from '../../components/CenteredMessage'
import { LoadError } from '../../components/LoadError'
import { ROUTES } from '../../routes.ts'
import { ExpenseNotFound } from '../../components/ExpenseNotFound'
import { getDb } from '../../db/client.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { expenseService } from '../../services/expenseService'
import { groupService } from '../../services/groupService'
import { belowStatusBar } from '../../theme/safeArea.ts'
import { EditExpenseForm } from './components/EditExpenseForm'

/** A column about 560 px wide, centered, like the add-expense page. */
const COLUMN_STYLE = { width: '100%', maxWidth: 560, margin: '0 auto', padding: `${belowStatusBar(24)} 16px 24px` } as const

/** Where any member of a group edits one of its expenses. */
export function EditExpensePage() {
  const user = useCurrentUser()
  const { id = '', expenseId = '' } = useParams()

  const userId = user?.personId ?? ''
  const datasetId = user?.datasetId ?? ''
  const { state, retry } = useAsyncData(async () => {
    const db = await getDb()
    const [group, expense] = await Promise.all([
      groupService.getGroup(db, userId, id),
      expenseService.getExpenseToEdit(db, userId, id, expenseId),
    ])
    if (!group || !expense) return null
    return { group, expense, recentCurrencies: await expenseService.recentCurrencies(db, userId) }
  }, `${userId}:${id}:${expenseId}`)

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  // A message (couldn't load, expense not found) is centered on the screen; the
  // form and its loading placeholder sit in the column.
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
        />
      ) : (
        <Card role="status" aria-label="Loading the expense">
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      )}
    </Flex>
  )
}
