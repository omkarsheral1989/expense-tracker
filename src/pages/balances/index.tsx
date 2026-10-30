import { Flex, Typography } from 'antd'
import { useParams } from 'react-router'
import { BackButton } from '../../components/BackButton'
import { CenteredMessage } from '../../components/CenteredMessage'
import { GroupNotFound } from '../../components/GroupNotFound'
import { LoadError } from '../../components/LoadError'
import { LoadingMessage } from '../../components/LoadingMessage'
import { useAppNavigate } from '../../hooks/useAppNavigate'
import { useCachedData } from '../../hooks/useCachedData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { ROUTES } from '../../routes.ts'
import type { GroupBalances } from '../../services/balancesService/types.ts'
import { HEADER_TITLE_STYLE } from '../../theme/headerTitle.ts'
import { aboveScreenEdge, belowStatusBar, HEADER_TOP_PADDING } from '../../theme/safeArea.ts'
import { BalanceRow } from './components/BalanceRow'
import type { SettlePrefill } from './types.ts'
import { BALANCES_PAGE, balancesKey, linesOf, loadBalances, orderedMembers, totalsOf } from './utils.ts'

const { Title } = Typography

/** A column about 560 px wide, centered, like the totals page. */
const COLUMN_STYLE = { width: '100%', maxWidth: 560, margin: '0 auto', padding: `${belowStatusBar(HEADER_TOP_PADDING)} 16px ${aboveScreenEdge(24)}` } as const

/**
 * What each member of a group is owed or owes (PRD 5.21), with the fewest payments that settle it under each row that is open,
 * and a button on each that opens Settle up with the payment filled in.
 */
export function BalancesPage() {
  const user = useCurrentUser()
  const navigate = useAppNavigate()
  const { id = '' } = useParams()
  const userId = user?.personId ?? ''

  const { state, retry } = useCachedData(() => loadBalances(userId, id), BALANCES_PAGE, balancesKey(userId, id))

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  function handleSettle(settle: SettlePrefill) {
    // `from` makes Settle up's Back lead here instead of to the group.
    navigate(ROUTES.settleUp(id), { state: { settle, from: 'balances' } })
  }

  function renderBalances(balances: GroupBalances) {
    const byId = new Map(balances.members.map((member) => [member.personId, member]))
    return (
      <Flex vertical style={COLUMN_STYLE}>
        <title>Balances · OwnLedger</title>
        <Flex align="center" gap={8} style={{ marginBottom: 16 }}>
          <BackButton onClick={() => navigate(ROUTES.group(id), { direction: 'back' })} />
          <Title level={3} style={HEADER_TITLE_STYLE}>
            Balances
          </Title>
        </Flex>
        <Flex vertical gap={12}>
          {orderedMembers(balances.members).map((member) => (
            <BalanceRow
              key={member.personId}
              member={member}
              totals={totalsOf(balances, member.personId)}
              lines={linesOf(balances, member.personId)}
              members={byId}
              onSettle={handleSettle}
              deleted={balances.deleted}
            />
          ))}
        </Flex>
      </Flex>
    )
  }

  switch (state.status) {
    case 'loading':
      return <LoadingMessage label="Loading the balances" />
    case 'error':
      return (
        <CenteredMessage>
          <LoadError title="Couldn't load the balances" onRetry={retry} error={state.error} backTo={ROUTES.group(id)} />
        </CenteredMessage>
      )
    case 'ready':
      if (!state.data) {
        return (
          <CenteredMessage>
            <title>Group not found · OwnLedger</title>
            <GroupNotFound />
          </CenteredMessage>
        )
      }
      return renderBalances(state.data)
  }
}
