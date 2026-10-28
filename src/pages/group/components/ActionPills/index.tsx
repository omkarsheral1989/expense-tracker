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
}

/**
 * The row of actions under the balance. It scrolls sideways when it does not
 * fit, so more pills can be added without wrapping. "Settle up" opens the page that
 * records a payment between two members and is switched off in a group of one;
 * "Totals" opens the totals page and is switched off while the group has no expenses.
 */
export function ActionPills({ groupId, group, canSettle, loading = false, canTotal = false }: Props) {
  const navigate = useAppNavigate()
  // The frame rounds the pill and draws its border; the button inside is square, so a picture of it alone is square (the browser
  // leaves out its parents' clipping), which the settle-up page grows out of (PRD 5.16, ADR-060).
  const settleUp = (
    <span
      data-settle-pill
      // The border is drawn over the button's edge by `[data-settle-pill]::after` (src/index.css), so the pill stays the controls' 40 px.
      style={{ display: 'flex', flex: 'none', borderRadius: PILL_RADIUS, overflow: 'hidden' }}
    >
      <Button
        disabled={!canSettle || loading}
        onClick={() => navigate(ROUTES.settleUp(groupId), { state: group && { group } })}
        data-vt="block"
        style={{ borderRadius: 0, border: 'none' }}
      >
        <span data-vt="pillLabel">Settle up</span>
      </Button>
    </span>
  )

  // The same white pill with round ends; it opens the totals page, which has no piece that travels, so it needs no frame of its own.
  const totals = (
    <Button
      disabled={!canTotal || loading}
      icon={<Icon name="chartBar" />}
      onClick={() => navigate(ROUTES.totals(groupId), { state: group && { group } })}
      style={{ borderRadius: PILL_RADIUS }}
    >
      Totals
    </Button>
  )

  return (
    <Flex gap={8} style={{ overflowX: 'auto', paddingBottom: 4 }}>
      {canSettle || loading ? (
        settleUp
      ) : (
        // A disabled button gets no pointer events, so the tip hangs on a wrapper.
        <Tooltip title="You are the only member of this group.">
          <span style={{ flex: 'none' }}>{settleUp}</span>
        </Tooltip>
      )}
      {canTotal || loading ? (
        <span style={{ flex: 'none' }}>{totals}</span>
      ) : (
        <Tooltip title="No expenses yet">
          <span style={{ flex: 'none' }}>{totals}</span>
        </Tooltip>
      )}
    </Flex>
  )
}
