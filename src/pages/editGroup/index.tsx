import { Flex, Skeleton } from 'antd'
import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import { CenteredMessage } from '../../components/CenteredMessage'
import { LoadError } from '../../components/LoadError'
import { ROUTES } from '../../routes.ts'
import { GroupNotFound } from '../../components/GroupNotFound'
import { getDb } from '../../db/client.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { groupService } from '../../services/groupService'
import { belowStatusBar } from '../../theme/safeArea.ts'
import { EditGroupForm } from './components/EditGroupForm'

/** Where any member of a group changes its name, type and default currency. */
export function EditGroupPage() {
  const user = useCurrentUser()
  const { id = '' } = useParams()

  const userId = user?.personId ?? ''
  const { state, retry } = useAsyncData(
    async () => groupService.getGroup(await getDb(), userId, id),
    `${userId}:${id}`,
  )

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  function renderLoading() {
    return (
      <Flex vertical role="status" aria-label="Loading the group">
        <Skeleton active paragraph={{ rows: 4 }} />
      </Flex>
    )
  }

  function renderError() {
    return (
      <CenteredMessage>
        <LoadError title="Couldn't load this group" onRetry={retry} error={state.status === 'error' ? state.error : undefined} backTo={ROUTES.group(id)} />
      </CenteredMessage>
    )
  }

  function renderContent() {
    switch (state.status) {
      case 'loading':
        return wrap(renderLoading())
      case 'error':
        return renderError()
      case 'ready':
        if (!state.data) {
          return (
            <CenteredMessage>
              <GroupNotFound />
            </CenteredMessage>
          )
        }
        return wrap(<EditGroupForm key={state.data.id} userId={userId} group={state.data} />)
    }
  }

  function wrap(content: ReactNode) {
    return (
      <Flex justify="center" style={{ padding: `${belowStatusBar(32)} 16px 32px` }}>
        <div style={{ width: '100%', maxWidth: 560 }}>{content}</div>
      </Flex>
    )
  }

  function renderTitle() {
    if (state.status !== 'ready') return null
    // React only accepts one string inside <title>, so the text is joined first.
    return <title>{`${state.data ? 'Edit group' : 'Group not found'} · OwnLedger`}</title>
  }

  return (
    <>
      {renderTitle()}
      {renderContent()}
    </>
  )
}
