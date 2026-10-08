import { Button, Card, Flex, Result, Skeleton } from 'antd'
import { useParams } from 'react-router'
import { GroupNotFound } from '../../components/GroupNotFound'
import { getDb } from '../../db/client.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { expenseService } from '../../services/expenseService'
import { groupService } from '../../services/groupService'
import { useAuthStore } from '../../stores/useAuthStore'
import { AddExpenseForm } from './components/AddExpenseForm'

/** A column about 560 px wide, centered, like the create-group page. */
const COLUMN_STYLE = { maxWidth: 560, margin: '0 auto', padding: '24px 16px' } as const

/** Where a signed-in user adds an expense to one of their groups. */
export function AddExpensePage() {
  const profile = useAuthStore((state) => state.profile)
  const { id = '' } = useParams()

  const email = profile?.email ?? ''
  const { state, retry } = useAsyncData(async () => {
    const db = await getDb()
    const group = await groupService.getGroup(db, email, id)
    if (!group) return null
    return { group, recentCurrencies: await expenseService.recentCurrencies(db, email) }
  }, `${email}:${id}`)

  // Signed-out visitors are sent away by `RequireAuth` before this matters.
  if (!profile) return null

  function renderContent() {
    switch (state.status) {
      case 'loading':
        return (
          <Card role="status" aria-label="Loading the group">
            <Skeleton active paragraph={{ rows: 6 }} />
          </Card>
        )
      case 'error':
        return (
          <Result
            status="error"
            title="Couldn't load this group"
            subTitle="Nothing was lost. Try again."
            extra={
              <Button type="primary" onClick={retry}>
                Try again
              </Button>
            }
          />
        )
      case 'ready':
        if (!state.data) {
          return (
            <>
              <title>Group not found · OwnLedger</title>
              <GroupNotFound />
            </>
          )
        }
        return (
          <AddExpenseForm
            group={state.data.group}
            userEmail={email}
            recentCurrencies={state.data.recentCurrencies}
          />
        )
    }
  }

  return (
    <Flex vertical style={COLUMN_STYLE}>
      {renderContent()}
    </Flex>
  )
}
