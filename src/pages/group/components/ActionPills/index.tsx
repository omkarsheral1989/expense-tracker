import { Button, Flex } from 'antd'
import { ComingSoon } from '../../../../components/ComingSoon'
import { PILL_RADIUS } from '../GroupBand/style.ts'

/**
 * The row of actions under the balance. It scrolls sideways when it does not
 * fit, so more pills can be added without wrapping. Only "Settle up" for now,
 * switched off until settling up exists.
 */
export function ActionPills() {
  return (
    <Flex gap={8} style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <ComingSoon>
        <Button disabled style={{ borderRadius: PILL_RADIUS, flex: 'none' }}>
          Settle up
        </Button>
      </ComingSoon>
    </Flex>
  )
}
