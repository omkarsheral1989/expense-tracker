import { Button, Flex, theme, Tooltip } from 'antd'
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
}

/**
 * The row of actions under the balance. It scrolls sideways when it does not
 * fit, so more pills can be added without wrapping. Only "Settle up" for now,
 * which opens the page that records a payment between two members; it is
 * switched off in a group of one.
 */
export function ActionPills({ groupId, group, canSettle, loading = false }: Props) {
  const navigate = useAppNavigate()
  const { token } = theme.useToken()
  // The frame rounds the pill and draws its border; the button inside is square, so a picture of it alone is square (the browser
  // leaves out its parents' clipping), which the settle-up page grows out of (PRD 5.16, ADR-060).
  const settleUp = (
    <span
      data-settle-pill
      // The border is an outline drawn over the inner edge, so the pill stays the controls' 40 px.
      style={{ display: 'flex', flex: 'none', borderRadius: PILL_RADIUS, overflow: 'hidden', outline: `1px solid ${token.colorBorder}`, outlineOffset: -1 }}
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
    </Flex>
  )
}
