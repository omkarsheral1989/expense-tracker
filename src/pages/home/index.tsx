import { PlusOutlined } from '@ant-design/icons'
import { Button, Card, Flex, Result, Skeleton, Typography } from 'antd'
import { useNavigate } from 'react-router'
import { getDb } from '../../db/client.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { ROUTES } from '../../routes.ts'
import { expenseService } from '../../services/expenseService'
import { groupService } from '../../services/groupService'
import { useAuthStore } from '../../stores/useAuthStore'
import { EmptyGroups } from './components/EmptyGroups'
import { GroupList } from './components/GroupList'

const { Title } = Typography

/** The signed-in user's groups, most recently active first. */
export function HomePage() {
  const profile = useAuthStore((state) => state.profile)
  const navigate = useNavigate()

  const email = profile?.email ?? ''
  const { state, retry } = useAsyncData(async () => {
    const db = await getDb()
    return {
      groups: await groupService.listGroups(db, email),
      balances: await expenseService.balancesByGroup(db, email),
    }
  }, email)

  // Signed-out visitors are sent away by `RequireAuth` before this matters.
  if (!profile) return null

  const createGroup = () => navigate(ROUTES.newGroup)
  const hasGroups = state.status === 'ready' && state.data.groups.length > 0

  function renderHeading() {
    return (
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          Your groups
        </Title>
        {hasGroups && (
          <Button type="primary" icon={<PlusOutlined />} onClick={createGroup}>
            Create group
          </Button>
        )}
      </Flex>
    )
  }

  function renderLoading() {
    return (
      <Flex vertical gap={12} role="status" aria-label="Loading your groups">
        {[0, 1, 2].map((row) => (
          <Card key={row}>
            <Skeleton active avatar paragraph={{ rows: 1 }} />
          </Card>
        ))}
      </Flex>
    )
  }

  function renderError() {
    return (
      <Result
        status="error"
        title="Couldn't load your groups"
        subTitle="Nothing was lost. Try again."
        extra={
          <Button type="primary" onClick={retry}>
            Try again
          </Button>
        }
      />
    )
  }

  function renderGroups() {
    switch (state.status) {
      case 'loading':
        return renderLoading()
      case 'error':
        return renderError()
      case 'ready':
        return state.data.groups.length === 0 ? (
          <EmptyGroups onCreate={createGroup} />
        ) : (
          <GroupList groups={state.data.groups} balances={state.data.balances} />
        )
    }
  }

  return (
    <Flex justify="center" style={{ padding: '24px 16px' }}>
      <title>Your groups · OwnLedger</title>
      <div style={{ width: '100%', maxWidth: 720 }}>
        {renderHeading()}
        {renderGroups()}
      </div>
    </Flex>
  )
}
