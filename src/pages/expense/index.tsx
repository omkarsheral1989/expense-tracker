import { Flex } from 'antd'
import { useLocation, useParams } from 'react-router'
import { CenteredMessage } from '../../components/CenteredMessage'
import { LoadingMessage } from '../../components/LoadingMessage'
import { LoadError } from '../../components/LoadError'
import { ROUTES } from '../../routes.ts'
import { KnownExpensePage } from './components/KnownExpense'
import { knownExpenseFrom } from './utils.ts'
import { ExpenseNotFound } from '../../components/ExpenseNotFound'
import { getDb } from '../../db/client.ts'
import { useCachedData } from '../../hooks/useCachedData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { expenseService } from '../../services/expenseService'
import { aboveScreenEdge, belowStatusBar } from '../../theme/safeArea.ts'
import { ExpenseDetails } from './components/ExpenseDetails'

/** A column about 560 px wide, centered, like the add-expense page. */
const COLUMN_STYLE = { width: '100%', maxWidth: 560, margin: '0 auto', padding: `${belowStatusBar(24)} 16px ${aboveScreenEdge(24)}` } as const

/**
 * The details of one expense of a group, with its history of changes, and the
 * way to edit or delete it.
 */
export function ExpensePage() {
  const user = useCurrentUser()
  const { id = '', expenseId = '' } = useParams()
  // What the group's list knew about this expense when its row was opened, if it was (ADR-053).
  const known = knownExpenseFrom(useLocation().state, id, expenseId)

  const userId = user?.personId ?? ''
  const datasetId = user?.datasetId ?? ''
  const { state, retry } = useCachedData(
    async () => expenseService.getExpense(await getDb(), userId, id, expenseId),
    `${userId}:${id}:${expenseId}`,
    // After a restoration the page reads the expense again, and meanwhile keeps showing it.
    { keepPrevious: true },
  )

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  function renderContent() {
    switch (state.status) {
      case 'loading':
        return null
      case 'error':
        return (
          <LoadError title="Couldn't load this expense" onRetry={retry} error={state.status === 'error' ? state.error : undefined} backTo={ROUTES.group(id)} />
        )
      case 'ready':
        return state.data ? (
          <ExpenseDetails expense={state.data} datasetId={datasetId} userId={userId} onChanged={retry} />
        ) : (
          <ExpenseNotFound groupId={id} />
        )
    }
  }

  function renderTitle() {
    if (state.status !== 'ready') return null
    // React only accepts one string inside <title>, so the text is joined first.
    return <title>{`${state.data ? expenseService.titleOf(state.data) : 'Expense not found'} · OwnLedger`}</title>
  }

  if (state.status === 'loading') {
    if (!known) return <LoadingMessage label="Loading the expense" />
    return (
      <>
        <title>{`${known.description} · OwnLedger`}</title>
        <KnownExpensePage expense={known} />
      </>
    )
  }

  // A message (couldn't load, expense not found) is centered on the screen; the
  // details and their loading placeholder sit in the column.
  if (state.status === 'error' || (state.status === 'ready' && !state.data)) {
    return (
      <CenteredMessage>
        {renderTitle()}
        {renderContent()}
      </CenteredMessage>
    )
  }

  // The details have a colored band across the full width, so they bring their own column.
  if (state.status === 'ready') {
    return (
      <>
        {renderTitle()}
        {renderContent()}
      </>
    )
  }

  return (
    <Flex vertical style={COLUMN_STYLE}>
      {renderTitle()}
      {renderContent()}
    </Flex>
  )
}
