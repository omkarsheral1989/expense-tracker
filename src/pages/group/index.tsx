import { Card, Flex, Skeleton } from 'antd'
import { useState } from 'react'
import { useParams } from 'react-router'
import { getDb } from '../../db/client.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { expenseService } from '../../services/expenseService'
import type { ExpenseListItem, PersonBalance } from '../../services/expenseService/types.ts'
import { groupService } from '../../services/groupService'
import { syncService } from '../../services/syncService'
import { useSyncStore } from '../../stores/useSyncStore'
import type { GroupDetails } from '../../services/groupService/types.ts'
import { ActionPills } from './components/ActionPills'
import { AddExpenseButton } from './components/AddExpenseButton'
import { BalanceLine } from './components/BalanceLine'
import { ExpenseList } from './components/ExpenseList'
import { GroupBand } from './components/GroupBand'
import { GroupNotFound } from '../../components/GroupNotFound'
import { MembersSheet } from './components/MembersSheet'
import { CenteredMessage } from '../../components/CenteredMessage'
import { LoadError } from '../../components/LoadError'
import { ROUTES } from '../../routes.ts'
import { FLOATING_BUTTON_ROOM } from '../../components/FloatingPillButton/constants.ts'
import { aboveScreenEdge, belowStatusBar } from '../../theme/safeArea.ts'

/** A column about 720 px wide, centered, which holds everything below the band. */
const COLUMN_STYLE = {
  width: '100%',
  maxWidth: 720,
  margin: '0 auto',
  padding: `${belowStatusBar(16)} 16px ${aboveScreenEdge(FLOATING_BUTTON_ROOM)}`,
} as const

/** One group: a colored band with its name and chips, the balance, actions and expenses. */
export function GroupPage() {
  const user = useCurrentUser()
  const [membersOpen, setMembersOpen] = useState(false)
  const { id = '' } = useParams()

  const userId = user?.personId ?? ''
  // Read again after a sync, which may bring in other members' changes.
  const dataVersion = useSyncStore((syncState) => syncState.dataVersion)
  // `keepPrevious`: reading the group again (after a member is added, or a sync)
  // keeps what is shown, so the members sheet stays open instead of flashing the placeholder.
  const { state, retry } = useAsyncData(async () => {
    const db = await getDb()
    const group = await groupService.getGroup(db, userId, id)
    if (!group) return null
    return {
      group,
      expenses: await expenseService.listExpenses(db, userId, id),
      balances: await expenseService.groupBalances(db, userId, id),
      syncedIds: await syncService.syncedMembers(db, id),
    }
  }, `${userId}:${id}:${dataVersion}`, { keepPrevious: true })

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  function renderLoading() {
    return (
      <div style={COLUMN_STYLE}>
        <Flex vertical gap={16} role="status" aria-label="Loading the group">
          <Skeleton active avatar paragraph={{ rows: 1 }} />
          <Card>
            <Skeleton active paragraph={{ rows: 3 }} />
          </Card>
        </Flex>
      </div>
    )
  }

  function renderError() {
    return (
      <CenteredMessage>
        <LoadError title="Couldn't load this group" onRetry={retry} error={state.status === 'error' ? state.error : undefined} backTo={ROUTES.home} />
      </CenteredMessage>
    )
  }

  function renderGroup(
    group: GroupDetails,
    expenses: ExpenseListItem[],
    balances: PersonBalance[],
    syncedIds: ReadonlySet<string>,
  ) {
    return (
      <Flex vertical style={{ flex: 1 }}>
        <GroupBand
          group={group}
          onOpenMembers={() => setMembersOpen(true)}
        />
        {/* No room at the bottom here: the list adds it, so an empty list can be
            centered in all the space below the actions. */}
        <Flex vertical style={{ ...COLUMN_STYLE, flex: 1, paddingBottom: 0 }}>
          <Flex vertical gap={16}>
            <BalanceLine balances={balances} />
            <ActionPills groupId={group.id} canSettle={group.members.length > 1} />
          </Flex>
          <ExpenseList expenses={expenses} groupId={group.id} />
        </Flex>
        <AddExpenseButton groupId={group.id} />
        <MembersSheet
          open={membersOpen}
          onClose={() => setMembersOpen(false)}
          members={group.members}
          syncedIds={syncedIds}
          groupId={group.id}
          userId={userId}
          onMemberAdded={retry}
        />
      </Flex>
    )
  }

  function renderNotFound() {
    return (
      <CenteredMessage>
        <GroupNotFound />
      </CenteredMessage>
    )
  }

  function renderContent() {
    switch (state.status) {
      case 'loading':
        return renderLoading()
      case 'error':
        return renderError()
      case 'ready':
        return state.data
          ? renderGroup(state.data.group, state.data.expenses, state.data.balances, state.data.syncedIds)
          : renderNotFound()
    }
  }

  function renderTitle() {
    if (state.status !== 'ready') return null
    // React only accepts one string inside <title>, so the text is joined first.
    return <title>{`${state.data ? state.data.group.name : 'Group not found'} · OwnLedger`}</title>
  }

  return (
    <>
      {renderTitle()}
      {renderContent()}
    </>
  )
}
