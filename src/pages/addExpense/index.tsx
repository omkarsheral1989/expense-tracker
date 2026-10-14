import { Button, Card, Flex, Result, Skeleton } from 'antd'
import { useLocation, useParams } from 'react-router'
import { CenteredMessage } from '../../components/CenteredMessage'
import { GroupNotFound } from '../../components/GroupNotFound'
import { getDb } from '../../db/client.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { expenseService } from '../../services/expenseService'
import { groupService } from '../../services/groupService'
import type { GroupDetails } from '../../services/groupService/types.ts'
import { useAuthStore } from '../../stores/useAuthStore'
import { belowStatusBar } from '../../theme/safeArea.ts'
import { AddExpenseForm } from './components/AddExpenseForm'
import type { AddExpenseLocationState } from './components/AddExpenseForm/types.ts'

/** A column about 560 px wide, centered, like the create-group page. */
const COLUMN_STYLE = { width: '100%', maxWidth: 560, margin: '0 auto', padding: `${belowStatusBar(24)} 16px 24px` } as const

/** Where a signed-in user adds an expense to one of their groups. */
export function AddExpensePage() {
  const profile = useAuthStore((state) => state.profile)
  const { id = '' } = useParams()
  // Set when the user moved the expense here from another group.
  const draft = (useLocation().state as AddExpenseLocationState)?.draft

  const email = profile?.email ?? ''
  const accountId = profile?.id ?? ''
  // Moving the expense to another group changes `id`: the form stays on screen
  // until the other group is loaded, instead of flashing a loading placeholder.
  const { state, retry } = useAsyncData(async () => {
    const db = await getDb()
    const group = await groupService.getGroup(db, email, id)
    if (!group) return null
    return {
      group,
      recentCurrencies: await expenseService.recentCurrencies(db, email),
      groups: await groupService.listGroups(db, email),
    }
  }, `${email}:${id}`, { keepPrevious: true })

  // Signed-out visitors are sent away by `RequireAuth` before this matters.
  if (!profile) return null

  // Someone else may have added the user before they ever used the app, so
  // their record has no name yet; their Google profile has.
  function withYourName(group: GroupDetails): GroupDetails {
    const members = group.members.map((member) =>
      member.isYou ? { ...member, name: member.name ?? profile?.name ?? null } : member,
    )
    return { ...group, members }
  }

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
            // A new form for each group: its fields start from the carried-over draft.
            key={state.data.group.id}
            group={withYourName(state.data.group)}
            accountId={accountId}
            userEmail={email}
            recentCurrencies={state.data.recentCurrencies}
            groups={state.data.groups}
            draft={draft}
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
