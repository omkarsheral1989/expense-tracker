import { Empty, Flex, Typography } from 'antd'
import { BackButton } from '../../components/BackButton'
import { CenteredMessage } from '../../components/CenteredMessage'
import { LoadError } from '../../components/LoadError'
import { LoadingMessage } from '../../components/LoadingMessage'
import { useAppNavigate } from '../../hooks/useAppNavigate'
import { useCachedData } from '../../hooks/useCachedData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { ROUTES } from '../../routes.ts'
import type { GroupSummary } from '../../services/groupService/types.ts'
import { useSyncStore } from '../../stores/useSyncStore'
import { HEADER_TITLE_STYLE } from '../../theme/headerTitle.ts'
import { aboveScreenEdge, belowStatusBar, HEADER_TOP_PADDING } from '../../theme/safeArea.ts'
import { DeletedGroupRow } from './components/DeletedGroupRow'
import { DELETED_GROUPS_PAGE, deletedGroupsKey, loadDeletedGroups } from './utils.ts'

const { Title } = Typography

/**
 * The groups the user deleted on this device, most recently deleted first (PRD 5.23); each opens the group read-only, where it can
 * be restored. Reached from the avatar menu, only with the feature turned on.
 */
export function DeletedGroupsPage() {
  const user = useCurrentUser()
  const navigate = useAppNavigate()
  const userId = user?.personId ?? ''
  // Read again after a sync, which may bring a deleted group back.
  const dataVersion = useSyncStore((syncState) => syncState.dataVersion)
  const { state, retry } = useCachedData(() => loadDeletedGroups(userId), DELETED_GROUPS_PAGE, deletedGroupsKey(userId, dataVersion), { keepPrevious: true })

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  function renderHeader() {
    return (
      <Flex align="center" gap={12} style={{ marginBottom: 16 }}>
        <BackButton onClick={() => navigate(ROUTES.home, { direction: 'back' })} />
        <Title level={3} style={HEADER_TITLE_STYLE}>
          Deleted groups
        </Title>
      </Flex>
    )
  }

  function renderList(groups: GroupSummary[]) {
    if (groups.length === 0) {
      return (
        <Flex align="center" justify="center" style={{ flex: 1 }}>
          <Empty description={<><div>No deleted groups</div><div>Groups you delete appear here.</div></>} />
        </Flex>
      )
    }
    return (
      <Flex vertical gap={12} role="list" aria-label="Deleted groups">
        {groups.map((group) => (
          <div key={group.id} role="listitem">
            <DeletedGroupRow group={group} />
          </div>
        ))}
      </Flex>
    )
  }

  function renderContent() {
    switch (state.status) {
      case 'loading':
        return <LoadingMessage label="Loading your deleted groups" />
      case 'error':
        return (
          <CenteredMessage>
            <LoadError title="Couldn't load your deleted groups" onRetry={retry} error={state.error} backTo={ROUTES.home} />
          </CenteredMessage>
        )
      case 'ready':
        return renderList(state.data)
    }
  }

  return (
    <Flex justify="center" style={{ flex: 1, padding: `${belowStatusBar(HEADER_TOP_PADDING)} 16px ${aboveScreenEdge(32)}` }}>
      <title>Deleted groups · OwnLedger</title>
      {/* A column that fills the screen, so the loader and the empty message are centered in what the header leaves. */}
      <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column' }}>
        {renderHeader()}
        {renderContent()}
      </div>
    </Flex>
  )
}
