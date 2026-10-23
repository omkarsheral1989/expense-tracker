import { Flex } from 'antd'
import { useParams } from 'react-router'
import { CenteredMessage } from '../../components/CenteredMessage'
import { LoadingMessage } from '../../components/LoadingMessage'
import { LoadError } from '../../components/LoadError'
import { ROUTES } from '../../routes.ts'
import { getDb } from '../../db/client.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { expenseService } from '../../services/expenseService'
import { aboveScreenEdge, belowStatusBar } from '../../theme/safeArea.ts'
import { VersionDetails } from './components/VersionDetails'
import { VersionNotFound } from './components/VersionNotFound'

/** A column about 560 px wide, centered, like the details page. */
const COLUMN_STYLE = { width: '100%', maxWidth: 560, margin: '0 auto', padding: `${belowStatusBar(24)} 16px ${aboveScreenEdge(24)}` } as const

/**
 * One version of an expense of a group: the expense as it was right after an
 * event of its history, read-only, with the way to put the expense back to it.
 */
export function ExpenseVersionPage() {
  const user = useCurrentUser()
  const { id = '', expenseId = '', eventId = '' } = useParams()

  const userId = user?.personId ?? ''
  const datasetId = user?.datasetId ?? ''
  const { state, retry } = useAsyncData(
    async () => expenseService.getExpenseVersion(await getDb(), userId, id, expenseId, eventId),
    `${userId}:${id}:${expenseId}:${eventId}`,
    // When the page's data goes out of date it reads it again, and meanwhile keeps showing it.
    { keepPrevious: true },
  )

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  if (state.status === 'error') {
    return (
      <CenteredMessage>
        <LoadError title="Couldn't load this version" onRetry={retry} error={state.status === 'error' ? state.error : undefined} backTo={ROUTES.expense(id, expenseId)} />
      </CenteredMessage>
    )
  }

  if (state.status === 'ready' && !state.data) {
    return (
      <CenteredMessage>
        <title>Version not found · OwnLedger</title>
        <VersionNotFound groupId={id} expenseId={expenseId} />
      </CenteredMessage>
    )
  }

  if (state.status === 'ready' && state.data) {
    return (
      <Flex vertical style={COLUMN_STYLE}>
        {/* React only accepts one string inside <title>, so the text is joined first. */}
        <title>{`Version of ${state.data.version.description} · OwnLedger`}</title>
        <VersionDetails data={state.data} datasetId={datasetId} userId={userId} onChanged={retry} />
      </Flex>
    )
  }

  return <LoadingMessage label="Loading the version" />
}
