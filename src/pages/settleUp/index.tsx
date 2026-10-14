import { Button, Card, Flex, Result, Skeleton } from 'antd'
import { useParams } from 'react-router'
import { CenteredMessage } from '../../components/CenteredMessage'
import { GroupNotFound } from '../../components/GroupNotFound'
import { getDb } from '../../db/client.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { expenseService } from '../../services/expenseService'
import { groupService } from '../../services/groupService'
import { belowStatusBar } from '../../theme/safeArea.ts'
import { SettleUpForm } from './components/SettleUpForm'

/** A column about 560 px wide, centered, like the add-expense page. */
const COLUMN_STYLE = { width: '100%', maxWidth: 560, margin: '0 auto', padding: `${belowStatusBar(24)} 16px 24px` } as const

/** Where a signed-in user records a payment between two members of one of their groups. */
export function SettleUpPage() {
  const user = useCurrentUser()
  const { id = '' } = useParams()

  const userId = user?.personId ?? ''
  const datasetId = user?.datasetId ?? ''
  const { state, retry } = useAsyncData(async () => {
    const db = await getDb()
    const group = await groupService.getGroup(db, userId, id)
    if (!group) return null
    return { group, recentCurrencies: await expenseService.recentCurrencies(db, userId) }
  }, `${userId}:${id}`)

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

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
          <SettleUpForm
            key={state.data.group.id}
            group={state.data.group}
            datasetId={datasetId}
            userId={userId}
            recentCurrencies={state.data.recentCurrencies}
          />
        )
    }
  }

  // A message (couldn't load, group not found) is centered on the screen; the
  // form and its loading placeholder sit in the column.
  if (state.status === 'error' || (state.status === 'ready' && !state.data)) {
    return <CenteredMessage>{renderContent()}</CenteredMessage>
  }

  return (
    <Flex vertical style={COLUMN_STYLE}>
      {renderContent()}
    </Flex>
  )
}
