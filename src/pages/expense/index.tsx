import { Button, Card, Flex, Result, Skeleton } from 'antd'
import { useParams } from 'react-router'
import { CenteredMessage } from '../../components/CenteredMessage'
import { ExpenseNotFound } from '../../components/ExpenseNotFound'
import { getDb } from '../../db/client.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { expenseService } from '../../services/expenseService'
import { belowStatusBar } from '../../theme/safeArea.ts'
import { ExpenseDetails } from './components/ExpenseDetails'

/** A column about 560 px wide, centered, like the add-expense page. */
const COLUMN_STYLE = { width: '100%', maxWidth: 560, margin: '0 auto', padding: `${belowStatusBar(24)} 16px 24px` } as const

/**
 * The details of one expense of a group, with its history of changes, and the
 * way to edit or delete it.
 */
export function ExpensePage() {
  const user = useCurrentUser()
  const { id = '', expenseId = '' } = useParams()

  const userId = user?.personId ?? ''
  const datasetId = user?.datasetId ?? ''
  const { state, retry } = useAsyncData(
    async () => expenseService.getExpense(await getDb(), userId, id, expenseId),
    `${userId}:${id}:${expenseId}`,
  )

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  function renderContent() {
    switch (state.status) {
      case 'loading':
        return (
          <Card role="status" aria-label="Loading the expense">
            <Skeleton active avatar paragraph={{ rows: 4 }} />
          </Card>
        )
      case 'error':
        return (
          <Result
            status="error"
            title="Couldn't load this expense"
            subTitle="Nothing was lost. Try again."
            extra={
              <Button type="primary" onClick={retry}>
                Try again
              </Button>
            }
          />
        )
      case 'ready':
        return state.data ? (
          <ExpenseDetails expense={state.data} datasetId={datasetId} userId={userId} />
        ) : (
          <ExpenseNotFound groupId={id} />
        )
    }
  }

  function renderTitle() {
    if (state.status !== 'ready') return null
    // React only accepts one string inside <title>, so the text is joined first.
    return <title>{`${state.data ? expenseService.titleOf(state.data) : 'Expense not found'} · OwnLedger`}</title>
  }

  // A message (couldn't load, expense not found) is centered on the screen; the
  // details and their loading placeholder sit in the column.
  if (state.status === 'error' || (state.status === 'ready' && !state.data)) {
    return (
      <CenteredMessage>
        {renderTitle()}
        {renderContent()}
      </CenteredMessage>
    )
  }

  return (
    <Flex vertical style={COLUMN_STYLE}>
      {renderTitle()}
      {renderContent()}
    </Flex>
  )
}
