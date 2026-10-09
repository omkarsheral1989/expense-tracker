import { Button, Card, Flex, Result, Skeleton } from 'antd'
import { useParams } from 'react-router'
import { getDb } from '../../db/client.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { expenseService } from '../../services/expenseService'
import { useAuthStore } from '../../stores/useAuthStore'
import { ExpenseDetailsCard } from './components/ExpenseDetailsCard'
import { ExpenseNotFound } from './components/ExpenseNotFound'

/** A column about 560 px wide, centered, like the add-expense page. */
const COLUMN_STYLE = { maxWidth: 560, margin: '0 auto', padding: '24px 16px' } as const

/**
 * The details of one expense of a group. For now it only shows them; editing,
 * deleting and the history of changes come later.
 */
export function ExpensePage() {
  const profile = useAuthStore((state) => state.profile)
  const { id = '', expenseId = '' } = useParams()

  const email = profile?.email ?? ''
  const accountId = profile?.id ?? ''
  const { state, retry } = useAsyncData(
    async () => expenseService.getExpense(await getDb(), email, id, expenseId),
    `${email}:${id}:${expenseId}`,
  )

  // Signed-out visitors are sent away by `RequireAuth` before this matters.
  if (!profile) return null

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
          <ExpenseDetailsCard expense={state.data} accountId={accountId} />
        ) : (
          <ExpenseNotFound groupId={id} />
        )
    }
  }

  function renderTitle() {
    if (state.status !== 'ready') return null
    // React only accepts one string inside <title>, so the text is joined first.
    return <title>{`${state.data ? state.data.description : 'Expense not found'} · OwnLedger`}</title>
  }

  return (
    <Flex vertical style={COLUMN_STYLE}>
      {renderTitle()}
      {renderContent()}
    </Flex>
  )
}
