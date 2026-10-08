import { Button, Card, Flex, Result, Skeleton } from 'antd'
import { useState } from 'react'
import { useParams } from 'react-router'
import { getDb } from '../../db/client.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { groupService } from '../../services/groupService'
import type { GroupDetails } from '../../services/groupService/types.ts'
import { useAuthStore } from '../../stores/useAuthStore'
import { ActionPills } from './components/ActionPills'
import { AddExpenseButton } from './components/AddExpenseButton'
import { BalanceLine } from './components/BalanceLine'
import { ExpenseList } from './components/ExpenseList'
import { GroupBand } from './components/GroupBand'
import { GroupNotFound } from './components/GroupNotFound'
import { MembersSheet } from './components/MembersSheet'

/** A column about 720 px wide, centered, which holds everything below the band. */
const COLUMN_STYLE = { maxWidth: 720, margin: '0 auto', padding: '16px 16px 112px' } as const

/** One group: a colored band with its name and chips, the balance, actions and expenses. */
export function GroupPage() {
  const profile = useAuthStore((state) => state.profile)
  const [membersOpen, setMembersOpen] = useState(false)
  const { id = '' } = useParams()

  const email = profile?.email ?? ''
  const { state, retry } = useAsyncData(
    async () => groupService.getGroup(await getDb(), email, id),
    `${email}:${id}`,
  )

  // Signed-out visitors are sent away by `RequireAuth` before this matters.
  if (!profile) return null

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
      <div style={COLUMN_STYLE}>
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
      </div>
    )
  }

  function renderGroup(group: GroupDetails) {
    // Someone else may have added the user before they ever used the app, so
    // their record has no name yet; their Google profile has.
    const members = group.members.map((member) =>
      member.isYou ? { ...member, name: member.name ?? profile?.name ?? null } : member,
    )

    return (
      <>
        <GroupBand
          group={{ ...group, members }}
          onOpenMembers={() => setMembersOpen(true)}
        />
        <div style={COLUMN_STYLE}>
          <Flex vertical gap={16}>
            <BalanceLine />
            <ActionPills />
            <ExpenseList />
          </Flex>
        </div>
        <AddExpenseButton />
        <MembersSheet
          open={membersOpen}
          onClose={() => setMembersOpen(false)}
          members={members}
        />
      </>
    )
  }

  function renderNotFound() {
    return (
      <div style={COLUMN_STYLE}>
        <GroupNotFound />
      </div>
    )
  }

  function renderContent() {
    switch (state.status) {
      case 'loading':
        return renderLoading()
      case 'error':
        return renderError()
      case 'ready':
        return state.data ? renderGroup(state.data) : renderNotFound()
    }
  }

  function renderTitle() {
    if (state.status !== 'ready') return null
    // React only accepts one string inside <title>, so the text is joined first.
    return <title>{`${state.data ? state.data.name : 'Group not found'} · OwnLedger`}</title>
  }

  return (
    <>
      {renderTitle()}
      {renderContent()}
    </>
  )
}
