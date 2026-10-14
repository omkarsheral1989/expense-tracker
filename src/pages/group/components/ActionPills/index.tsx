import { Button, Flex, Tooltip } from 'antd'
import { useNavigate } from 'react-router'
import { ROUTES } from '../../../../routes.ts'
import { PILL_RADIUS } from '../../../../theme/radius.ts'

type Props = {
  groupId: string
  /** The group has someone besides the user, so there is someone to settle up with. */
  canSettle: boolean
}

/**
 * The row of actions under the balance. It scrolls sideways when it does not
 * fit, so more pills can be added without wrapping. Only "Settle up" for now,
 * which opens the page that records a payment between two members; it is
 * switched off in a group of one.
 */
export function ActionPills({ groupId, canSettle }: Props) {
  const navigate = useNavigate()
  const settleUp = (
    <Button
      disabled={!canSettle}
      onClick={() => navigate(ROUTES.settleUp(groupId))}
      style={{ borderRadius: PILL_RADIUS, flex: 'none' }}
    >
      Settle up
    </Button>
  )

  return (
    <Flex gap={8} style={{ overflowX: 'auto', paddingBottom: 4 }}>
      {canSettle ? (
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
