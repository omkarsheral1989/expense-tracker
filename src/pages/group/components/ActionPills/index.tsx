import { Button, Flex, Tooltip } from 'antd'
import { useNavigate } from 'react-router'
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
  const navigate = useNavigate()
  const settleUp = (
    <Button
      disabled={!canSettle || loading}
      onClick={() => navigate(ROUTES.settleUp(groupId), { state: group && { group } })}
      style={{ borderRadius: PILL_RADIUS, flex: 'none' }}
    >
      Settle up
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
    </Flex>
  )
}
