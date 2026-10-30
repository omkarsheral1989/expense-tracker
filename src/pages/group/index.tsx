import { useQueryClient } from '@tanstack/react-query'
import { App, Flex } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router'
import { getDb } from '../../db/client.ts'
import { prefetchCachedData, useCachedData } from '../../hooks/useCachedData'
import { useAppNavigate } from '../../hooks/useAppNavigate'
import { useConfirm } from '../../hooks/useConfirm'
import { DELETE_GROUP_ENABLED } from '../../features.ts'
import { groupDeletionService } from '../../services/groupDeletionService'
import { dateService } from '../../services/dateService'
import { lineText, linesOf, orderedMembers } from '../balances/utils.ts'
import { refreshHomePage } from '../home/utils.ts'
import { Typography } from 'antd'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { expenseService } from '../../services/expenseService'
import { EXPENSE_PAGE_SIZE } from '../../services/expenseService/constants.ts'
import type { ExpenseCursor, PersonBalance } from '../../services/expenseService/types.ts'
import { useSyncStore } from '../../stores/useSyncStore'
import type { GroupDetails } from '../../services/groupService/types.ts'
import { ActionPills } from './components/ActionPills'
import { AddExpenseButton } from './components/AddExpenseButton'
import { BalanceLine } from './components/BalanceLine'
import { ExpenseList } from './components/ExpenseList'
import { useExpenseBatches } from './hooks/useExpenseBatches'
import { GroupBand } from './components/GroupBand'
import { GroupNotFound } from '../../components/GroupNotFound'
import { MembersSheet } from './components/MembersSheet'
import { CenteredMessage } from '../../components/CenteredMessage'
import { LoadingMessage } from '../../components/LoadingMessage'
import { LoadError } from '../../components/LoadError'
import { ROUTES } from '../../routes.ts'
import { GROUP_PAGE, groupPageKey, knownGroupFrom, loadGroupPage } from './utils.ts'
import { EDIT_GROUP_PAGE, editGroupKey, loadGroupToEdit } from '../editGroup/utils.ts'
import { ADD_EXPENSE_PAGE, addExpenseKey, loadAddExpense } from '../addExpense/utils.ts'
import { loadSettleUp, SETTLE_UP_PAGE, settleUpKey } from '../settleUp/utils.ts'
import type { KnownGroup } from './types.ts'
import { ABOVE_FLOATING_BUTTON, FLOATING_BUTTON_ROOM } from '../../components/FloatingPillButton/constants.ts'
import { aboveScreenEdge, UNDER_BAND_PADDING } from '../../theme/safeArea.ts'

/** A column about 720 px wide, centered, which holds everything below the band. */
const COLUMN_STYLE = {
  width: '100%',
  maxWidth: 720,
  margin: '0 auto',
  padding: `${UNDER_BAND_PADDING}px 16px ${aboveScreenEdge(FLOATING_BUTTON_ROOM)}`,
} as const

/** One group: a colored band with its name and chips, the balance, actions and expenses. */
export function GroupPage() {
  const user = useCurrentUser()
  const [membersOpen, setMembersOpen] = useState(false)
  const { id = '' } = useParams()
  // What the home list knew about this group when its row was opened, if it was (ADR-052).
  const known = knownGroupFrom(useLocation().state, id)

  const userId = user?.personId ?? ''
  const navigate = useAppNavigate()
  const confirm = useConfirm()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  // Read again after a sync, which may bring in other members' changes.
  const dataVersion = useSyncStore((syncState) => syncState.dataVersion)
  // `keepPrevious`: reading the group again (after a member is added, or a sync)
  // keeps what is shown, so the members sheet stays open instead of flashing the placeholder.
  // How many expenses are on screen, so a read again keeps the list as long (ADR-058).
  const shown = useRef(EXPENSE_PAGE_SIZE)
  const { state, retry } = useCachedData(() => loadGroupPage(userId, id, shown.current), GROUP_PAGE, groupPageKey(userId, id, dataVersion), {
    keepPrevious: true,
  })

  // The batches after the first, read as the user scrolls to the end of the list.
  const readNext = useCallback(
    async (after: ExpenseCursor) => expenseService.listExpensesPage(await getDb(), userId, id, { limit: EXPENSE_PAGE_SIZE, after }),
    [userId, id],
  )
  const batches = useExpenseBatches(state.status === 'ready' && state.data ? state.data.expenses : null, readNext, `${userId}:${id}`)
  useEffect(() => {
    shown.current = Math.max(EXPENSE_PAGE_SIZE, batches.items.length)
  }, [batches.items.length])

  // Read what Edit group, Add expense and Settle up will need while the group is on screen, so their forms open at once (ADR-055).
  const loaded = state.status === 'ready' ? state.data : null
  useEffect(() => {
    if (!loaded || loaded.group.deletedSince) return
    void prefetchCachedData(queryClient, () => loadGroupToEdit(userId, id), EDIT_GROUP_PAGE, editGroupKey(userId, id))
    void prefetchCachedData(queryClient, () => loadAddExpense(userId, id), ADD_EXPENSE_PAGE, addExpenseKey(userId, id))
    void prefetchCachedData(queryClient, () => loadSettleUp(userId, id), SETTLE_UP_PAGE, settleUpKey(userId, id))
  }, [queryClient, loaded, userId, id])

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  // With what the list knew, the page opens with its band and buttons and only the rest loads; otherwise it is all a loader.
  function renderLoading() {
    if (!known) return <LoadingMessage label="Loading the group" />
    return renderKnown(known)
  }

  function renderKnown(group: KnownGroup) {
    return (
      <Flex vertical style={{ flex: 1 }}>
        <GroupBand group={group} peopleCount={group.memberCount} />
        <Flex vertical style={{ ...COLUMN_STYLE, flex: 1, paddingBottom: 0 }}>
          <ActionPills groupId={group.id} group={group} canSettle={false} loading />
          <LoadingMessage label="Loading the group" roomBelow={ABOVE_FLOATING_BUTTON} />
        </Flex>
        <AddExpenseButton groupId={group.id} group={group} />
      </Flex>
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
    balances: PersonBalance[],
    syncedIds: ReadonlySet<string>,
    hasSpending: boolean,
  ) {
    // What the pages opened from here can show while they load (ADR-054).
    const deleted = group.deletedSince !== null && group.deletedSince !== undefined
    const known: KnownGroup = { id: group.id, name: group.name, type: group.type, defaultCurrency: group.defaultCurrency, memberCount: group.members.length }
    return (
      <Flex vertical style={{ flex: 1 }}>
        <GroupBand
          group={group}
          peopleCount={group.members.length}
          onOpenMembers={() => setMembersOpen(true)}
          deleted={deleted}
          onDelete={DELETE_GROUP_ENABLED && !deleted ? handleDelete : undefined}
          onRestore={handleRestore}
        />
        {/* No room at the bottom here: the list adds it, so an empty list can be
            centered in all the space below the actions. */}
        <Flex vertical style={{ ...COLUMN_STYLE, flex: 1, paddingBottom: 0 }}>
          <Flex vertical gap={16}>
            {deleted && group.deletedSince && (
              <Typography.Text type="secondary">
                You deleted this group on {dateService.formatDate(group.deletedSince.toISOString().slice(0, 10))}. It comes back if someone changes it.
              </Typography.Text>
            )}
            <ActionPills groupId={group.id} group={known} canSettle={group.members.length > 1} canTotal={hasSpending} readOnly={deleted} />
            <BalanceLine balances={balances} />
          </Flex>
          <ExpenseList
            expenses={batches.items}
            groupId={group.id}
            soloGroup={group.members.length === 1}
            hasMore={batches.hasMore}
            loadingMore={batches.loading}
            loadMoreFailed={batches.failed}
            onLoadMore={batches.loadMore}
            readOnly={deleted}
          />
        </Flex>
        {!deleted && <AddExpenseButton groupId={group.id} group={known} />}
        <MembersSheet
          open={membersOpen}
          onClose={() => setMembersOpen(false)}
          members={group.members}
          syncedIds={syncedIds}
          groupId={group.id}
          userId={userId}
          onMemberAdded={retry}
          readOnly={deleted}
        />
      </Flex>
    )
  }

  function showUnsettled(unsettled: NonNullable<typeof loaded>['unsettled'] & object) {
    const byId = new Map(unsettled.members.map((member) => [member.personId, member]))
    const payments = orderedMembers(unsettled.members).flatMap((member) =>
      linesOf(unsettled, member.personId)
        .filter((line) => line.kind === 'owes')
        .map((line) => lineText(member, byId.get(line.otherId) ?? member, line)),
    )
    confirm({
      title: "This group isn't settled up yet",
      content: (
        <Flex vertical gap={4}>
          <span>Settle up first, then delete it. Still to be paid:</span>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {payments.map((payment) => (
              <li key={payment}>{payment}</li>
            ))}
          </ul>
        </Flex>
      ),
      okText: 'Open balances',
      cancelText: 'Cancel',
      onOk: () => navigate(ROUTES.balances(id)),
    })
  }

  function handleDelete() {
    if (loaded?.unsettled) {
      showUnsettled(loaded.unsettled)
      return
    }
    confirm({
      title: 'Delete this group?',
      content: 'It will be hidden on this device only. Other members keep it, and it comes back if someone changes it.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const result = await groupDeletionService.deleteGroup(await getDb(), userId, id)
          if (result.ok) {
            message.success('Group deleted.')
            await refreshHomePage(queryClient, userId)
            navigate(ROUTES.home, { direction: 'back' })
          } else if (result.notSettled) {
            retry()
            showUnsettled(result.balances)
          } else {
            message.error('This group is no longer available.')
            navigate(ROUTES.home, { direction: 'back' })
          }
        } catch {
          message.error("Couldn't delete the group. Please try again.")
        }
      },
    })
  }

  async function handleRestore() {
    try {
      const result = await groupDeletionService.restoreGroup(await getDb(), userId, id)
      if (result.ok) {
        message.success('Group restored.')
        retry()
      } else if (result.message) {
        message.error(result.message)
      } else {
        message.error('This group is no longer available.')
        retry()
      }
    } catch {
      message.error("Couldn't restore the group. Please try again.")
    }
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
          ? renderGroup(state.data.group, state.data.balances, state.data.syncedIds, state.data.hasSpending)
          : renderNotFound()
    }
  }

  function renderTitle() {
    if (state.status === 'loading') return known ? <title>{`${known.name} · OwnLedger`}</title> : null
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
