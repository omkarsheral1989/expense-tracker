import { Flex } from 'antd'
import type { ReactNode } from 'react'
import { useLocation, useParams } from 'react-router'
import { CenteredMessage } from '../../components/CenteredMessage'
import { FormLoadingShell } from '../../components/FormLoadingShell'
import { GroupTypeBackground } from '../../components/GroupTypeBackground'
import { knownGroupFrom } from '../group/utils.ts'
import { LoadingMessage } from '../../components/LoadingMessage'
import { LoadError } from '../../components/LoadError'
import { ROUTES } from '../../routes.ts'
import { GroupNotFound } from '../../components/GroupNotFound'
import { getDb } from '../../db/client.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { groupService } from '../../services/groupService'
import { aboveScreenEdge, belowStatusBar, HEADER_TOP_PADDING } from '../../theme/safeArea.ts'
import { EditGroupForm } from './components/EditGroupForm'

/** Where any member of a group changes its name, type and default currency. */
export function EditGroupPage() {
  const user = useCurrentUser()
  const { id = '' } = useParams()
  // What the group's page knew when it opened this one, if it did (ADR-054).
  const known = knownGroupFrom(useLocation().state, id)

  const userId = user?.personId ?? ''
  const { state, retry } = useAsyncData(
    async () => groupService.getGroup(await getDb(), userId, id),
    `${userId}:${id}`,
  )

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  function renderLoading() {
    if (!known) return <LoadingMessage label="Loading the group" />
    // The page's header, in the wash of the group's type, with a spinner where the fields will be.
    return (
      <>
        <title>Edit group · OwnLedger</title>
        <GroupTypeBackground type={known.type} />
        <FormLoadingShell heading="Edit group" backTo={ROUTES.group(id)} label="Loading the group" />
      </>
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
        return renderLoading()
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
      <Flex justify="center" style={{ padding: `${belowStatusBar(HEADER_TOP_PADDING)} 16px ${aboveScreenEdge(32)}` }}>
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
