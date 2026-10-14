import { Empty, Flex } from 'antd'
import { ABOVE_FLOATING_BUTTON } from '../../../../components/FloatingPillButton/constants.ts'

/**
 * What the home page shows before the user has any group. Its box runs from the
 * heading down to just above the floating Create group button, and the message
 * is centered in it.
 */
export function EmptyGroups() {
  return (
    <Flex align="center" justify="center" style={{ flex: 1, marginBottom: ABOVE_FLOATING_BUTTON }}>
      <Empty description="No groups yet. Create one to start sharing expenses." />
    </Flex>
  )
}
