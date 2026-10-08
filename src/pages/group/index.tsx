import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Card, Flex, Result, Skeleton } from 'antd'
import { useNavigate, useParams } from 'react-router'
import { getDb } from '../../db/client.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { ROUTES } from '../../routes.ts'
import { groupService } from '../../services/groupService'
import type { GroupDetails } from '../../services/groupService/types.ts'
import { useAuthStore } from '../../stores/useAuthStore'
import { GroupHeading } from './components/GroupHeading'
import { GroupNotFound } from './components/GroupNotFound'
import { MemberList } from './components/MemberList'

/** One group: its details and its members. */
export function GroupPage() {
  const profile = useAuthStore((state) => state.profile)
  const navigate = useNavigate()
  const { id = '' } = useParams()

  const email = profile?.email ?? ''
  const { state, retry } = useAsyncData(
    async () => groupService.getGroup(await getDb(), email, id),
    `${email}:${id}`,
  )

  // Signed-out visitors are sent away by `RequireAuth` before this matters.
  if (!profile) return null

  function renderBackButton() {
    return (
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        aria-label="Back"
        onClick={() => navigate(ROUTES.home)}
      />
    )
  }

  function renderLoading() {
    return (
      <Flex vertical gap={16} role="status" aria-label="Loading the group">
        <Skeleton active avatar paragraph={{ rows: 1 }} />
        <Card>
          <Skeleton active paragraph={{ rows: 3 }} />
        </Card>
      </Flex>
    )
  }

  function renderError() {
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
  }

  function renderGroup(group: GroupDetails) {
    // Someone else may have added the user before they ever used the app, so
    // their record has no name yet; their Google profile has.
    const members = group.members.map((member) =>
      member.isYou ? { ...member, name: member.name ?? profile?.name ?? null } : member,
    )

    return (
      <Flex vertical gap={16}>
        <Flex align="center" gap={8}>
          {renderBackButton()}
          <GroupHeading group={group} />
        </Flex>
        <MemberList members={members} />
      </Flex>
    )
  }

  function renderContent() {
    switch (state.status) {
      case 'loading':
        return renderLoading()
      case 'error':
        return renderError()
      case 'ready':
        return state.data ? renderGroup(state.data) : <GroupNotFound />
    }
  }

  function renderTitle() {
    if (state.status !== 'ready') return null
    // React only accepts one string inside <title>, so the text is joined first.
    return <title>{`${state.data ? state.data.name : 'Group not found'} · OwnLedger`}</title>
  }

  return (
    <Flex justify="center" style={{ padding: '24px 16px' }}>
      {renderTitle()}
      <div style={{ width: '100%', maxWidth: 720 }}>{renderContent()}</div>
    </Flex>
  )
}
