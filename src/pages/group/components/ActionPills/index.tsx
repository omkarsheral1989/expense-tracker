import type { ReactNode } from 'react'
import { Icon } from '../../../../components/Icon'
import { Button, Flex, Tooltip } from 'antd'
import { useAppNavigate } from '../../../../hooks/useAppNavigate'
import { ROUTES } from '../../../../routes.ts'
import { PILL_RADIUS } from '../../../../theme/radius.ts'
import type { KnownGroup } from '../../types.ts'

type Props = {
  groupId: string
  /** What the page knows of the group, handed on so the settle-up page can show it while it loads (ADR-054). */
  group?: KnownGroup
  /** The group has someone besides the user, so there is someone to settle up with. */
  canSettle: boolean
  /** The members are still loading, so whether there is anyone to settle up with is not known: switched off, with no tip. */
  loading?: boolean
  /** The group has an expense that counts as spending, so there are totals to show (PRD 5.20); false switches the Totals pill off. */
  canTotal?: boolean
  /** The group is deleted on this device (PRD 5.23): Settle up is switched off, with a tip; Balances and Totals can still be read. */
  readOnly?: boolean
}

/**
 * The row of actions under the balance. It scrolls sideways when it does not
 * fit, so more pills can be added without wrapping. "Settle up" opens the page that
 * records a payment between two members and is switched off in a group of one;
 * "Balances" opens the balances page and is switched off in a group of one; "Totals" opens the totals page and is switched off while the group has no expenses.
 */
/** The pills' round ends; `flex: 'none'` keeps each from shrinking in the sideways-scrolling row. */
const PILL_STYLE = { borderRadius: PILL_RADIUS, flex: 'none' } as const

export function ActionPills({ groupId, group, canSettle, loading = false, canTotal = false, readOnly = false }: Props) {
  const navigate = useAppNavigate()
  const settleUp = (
    <Button
      disabled={!canSettle || loading || readOnly}
      icon={<Icon name="exchange" />}
      onClick={() => navigate(ROUTES.settleUp(groupId), { state: group && { group } })}
      style={PILL_STYLE}
    >
      Settle up
    </Button>
  )

  // The same white pill with round ends; it opens the totals page and is switched off while the group has no expenses.
  const totals = (
    <Button
      disabled={!canTotal || loading}
      icon={<Icon name="chartBar" />}
      onClick={() => navigate(ROUTES.totals(groupId), { state: group && { group } })}
      style={PILL_STYLE}
    >
      Totals
    </Button>
  )

  // The same white pill with round ends; it opens the balances page and, like Settle up, needs someone besides the user.
  const balances = (
    <Button
      disabled={!canSettle || loading}
      icon={<Icon name="scale" />}
      onClick={() => navigate(ROUTES.balances(groupId), { state: group && { group } })}
      style={PILL_STYLE}
    >
      Balances
    </Button>
  )

  // A disabled button gets no pointer events, so its tip hangs on a wrapper; an enabled one needs none.
  const renderPill = (pill: ReactNode, tip: string | null) =>
    tip ? (
      <Tooltip title={tip}>
        <span style={{ flex: 'none' }}>{pill}</span>
      </Tooltip>
    ) : (
      pill
    )

  const onlyMemberTip = 'You are the only member of this group.'
  const settleTip = readOnly ? 'This group is deleted.' : canSettle || loading ? null : onlyMemberTip

  return (
    <Flex gap={8} style={{ overflowX: 'auto', paddingBottom: 4 }}>
      {renderPill(settleUp, settleTip)}
      {renderPill(balances, canSettle || loading ? null : onlyMemberTip)}
      {renderPill(totals, canTotal || loading ? null : 'No expenses yet')}
    </Flex>
  )
}
