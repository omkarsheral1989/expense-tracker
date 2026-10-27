import { useQueryClient } from '@tanstack/react-query'
import { Button, Empty, Flex, Spin, Typography } from 'antd'
import { useEffect, useRef } from 'react'
import { BackButton } from '../../components/BackButton'
import { CenteredMessage } from '../../components/CenteredMessage'
import { LoadError } from '../../components/LoadError'
import { LoadingMessage } from '../../components/LoadingMessage'
import { getDb } from '../../db/client.ts'
import { useBatches } from '../../hooks/useBatches'
import { useAppNavigate } from '../../hooks/useAppNavigate'
import { useCachedData } from '../../hooks/useCachedData'
import { PAGE_QUERY_ROOT } from '../../hooks/useCachedData/constants.ts'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { ROUTES } from '../../routes.ts'
import { activityService } from '../../services/activityService'
import { ACTIVITY_PAGE_SIZE } from '../../services/activityService/constants.ts'
import type { ActivityCursor } from '../../services/activityService/types.ts'
import { useSyncStore } from '../../stores/useSyncStore'
import { HEADER_TITLE_STYLE } from '../../theme/headerTitle.ts'
import { aboveScreenEdge, belowStatusBar, HEADER_TOP_PADDING } from '../../theme/safeArea.ts'
import { ActivityRow } from './components/ActivityRow'
import { isNewItem } from './utils.ts'

const { Text, Title } = Typography

/** How far before the end of the list the next batch is asked for: about a screen. */
const LOAD_MORE_MARGIN = '600px'

/** Leaving the page marks it seen; waits a tick so React's development remount (cleanup, then mount again) cancels it. */
let pendingSeen: ReturnType<typeof setTimeout> | undefined

/**
 * What happened to expenses and payments across the user's groups, newest first,
 * with the other members' events the user has not seen highlighted (PRD 5.18).
 * Leaving the page marks everything seen.
 */
export function ActivityPage() {
  const user = useCurrentUser()
  const navigate = useAppNavigate()
  const userId = user?.personId ?? ''
  const dataVersion = useSyncStore((state) => state.dataVersion)
  const client = useQueryClient()
  // How many rows are on screen, so reading the page again keeps the list as long as it was (ADR-058).
  const shown = useRef(0)

  // The page and when the user last left it, read together: the highlights keep that time for the whole visit.
  const { state, retry } = useCachedData(
    async () => {
      const db = await getDb()
      const [page, unread] = await Promise.all([activityService.listActivity(db, userId, { limit: Math.max(ACTIVITY_PAGE_SIZE, shown.current) }), activityService.unreadState(db, userId)])
      return { page, seenAt: unread.seenAt }
    },
    'activity', `${userId}:${dataVersion}`,
    { keepPrevious: true },
  )
  const base = state.status === 'ready' ? state.data.page : null
  const seenAt = state.status === 'ready' ? state.data.seenAt : null
  const readNext = async (after: ActivityCursor) => activityService.listActivity(await getDb(), userId, { after })
  const { items, hasMore, loading, failed, loadMore } = useBatches(base, readNext, 'activityBatches', userId)

  // Mark everything seen when the user leaves.
  useEffect(() => {
    clearTimeout(pendingSeen)
    return () => {
      pendingSeen = setTimeout(
        () =>
          void getDb()
            .then((db) => activityService.markSeen(db))
            // The avatar menu's dot reads it again; the page itself is left as it is, so coming back is instant.
            .then(() => client.invalidateQueries({ queryKey: [PAGE_QUERY_ROOT, 'activityUnread'] })),
        0,
      )
    }
  }, [client])

  shown.current = items.length

  const end = useRef<HTMLDivElement>(null)
  // Asks for the next batch when the end of the list comes near the view, set up again after each batch.
  useEffect(() => {
    const target = end.current
    if (!target || !hasMore || loading || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && loadMore(), {
      rootMargin: LOAD_MORE_MARGIN,
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, loading, loadMore, items.length])

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  function renderHeader() {
    return (
      <Flex align="center" gap={12} style={{ marginBottom: 16 }}>
        <BackButton onClick={() => navigate(ROUTES.home, { direction: 'back' })} />
        <Title level={3} style={HEADER_TITLE_STYLE}>
          Activity
        </Title>
      </Flex>
    )
  }

  function renderEnd() {
    if (failed) {
      return (
        <Flex align="center" justify="center" gap={8} role="alert">
          <Text type="secondary">Couldn't load more.</Text>
          <Button type="link" onClick={loadMore}>
            Try again
          </Button>
        </Flex>
      )
    }
    if (!hasMore) return null
    return (
      <div ref={end} data-testid="list-end" style={{ display: 'flex', justifyContent: 'center', padding: 8, minHeight: 40 }}>
        {loading && <Spin size="small" aria-label="Loading more activity" />}
      </div>
    )
  }

  function renderContent() {
    if (state.status === 'loading') return <LoadingMessage label="Loading your activity" />
    if (items.length === 0) {
      return (
        <Flex align="center" justify="center" style={{ flex: 1 }}>
          <Empty
            description={
              <>
                <Text strong>No activity yet</Text>
                <br />
                <Text type="secondary">Changes to expenses in your groups will appear here.</Text>
              </>
            }
          />
        </Flex>
      )
    }
    return (
      <Flex vertical role="list" aria-label="Activity">
        {items.map((item) => (
          <ActivityRow key={item.id} item={item} isNew={isNewItem(item, seenAt)} />
        ))}
        {renderEnd()}
      </Flex>
    )
  }

  // The load error has its own Back button, so the page's header is left out.
  if (state.status === 'error') {
    return (
      <CenteredMessage>
        <LoadError title="Couldn't load your activity" onRetry={retry} error={state.error} backTo={ROUTES.home} />
      </CenteredMessage>
    )
  }

  return (
    <Flex justify="center" style={{ flex: 1, padding: `${belowStatusBar(HEADER_TOP_PADDING)} 16px ${aboveScreenEdge(32)}` }}>
      <title>Activity · OwnLedger</title>
      {/* A column that fills the screen, so the loader and the empty message are centered in what the header leaves. */}
      <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column' }}>
        {renderHeader()}
        {renderContent()}
      </div>
    </Flex>
  )
}
