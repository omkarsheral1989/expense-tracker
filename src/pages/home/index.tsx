import { Button, Card, Flex, Result, Skeleton, Typography, theme } from 'antd'
import { useNavigate } from 'react-router'
import { getDb } from '../../db/client.ts'
import { CenteredMessage } from '../../components/CenteredMessage'
import { TintedPageBackground } from '../../components/TintedPageBackground'
import { FloatingPillButton } from '../../components/FloatingPillButton'
import { ABOVE_FLOATING_BUTTON, FLOATING_BUTTON_ROOM } from '../../components/FloatingPillButton/constants.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { ROUTES } from '../../routes.ts'
import { expenseService } from '../../services/expenseService'
import { groupService } from '../../services/groupService'
import { useSyncStore } from '../../stores/useSyncStore'
import { EmptyGroups } from './components/EmptyGroups'
import { GroupList } from './components/GroupList'
import { aboveScreenEdge } from '../../theme/safeArea.ts'

const { Title } = Typography

/** The user's groups, most recently active first. */
export function HomePage() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const { token } = theme.useToken()

  const userId = user?.personId ?? ''
  // Read again after a sync, which may bring in groups.
  const dataVersion = useSyncStore((syncState) => syncState.dataVersion)
  const { state, retry } = useAsyncData(async () => {
    const db = await getDb()
    return {
      groups: await groupService.listGroups(db, userId),
      balances: await expenseService.balancesByGroup(db, userId),
    }
  }, `${userId}:${dataVersion}`, { keepPrevious: true })

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null


  function renderHeading() {
    return (
      <Title level={3} style={{ margin: '0 0 16px', fontSize: 22, color: token.colorTextSecondary }}>
        Your groups
      </Title>
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
    // Centered in the space between the heading and the floating button.
    return (
      <CenteredMessage roomBelow={ABOVE_FLOATING_BUTTON}>
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
      </CenteredMessage>
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
          <EmptyGroups />
        ) : (
          <div style={{ paddingBottom: aboveScreenEdge(FLOATING_BUTTON_ROOM) }}>
            <GroupList groups={state.data.groups} balances={state.data.balances} />
          </div>
        )
    }
  }

  return (
    <Flex justify="center" style={{ flex: 1, padding: '24px 16px 0' }}>
      <title>Your groups · OwnLedger</title>
      <TintedPageBackground color={token.colorPrimary} />
      <Flex vertical style={{ width: '100%', maxWidth: 720 }}>
        {renderHeading()}
        {renderGroups()}
      </Flex>
      <FloatingPillButton onClick={() => navigate(ROUTES.newGroup)}>Create group</FloatingPillButton>
    </Flex>
  )
}
