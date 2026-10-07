import { Typography } from 'antd'

const { Text } = Typography

/**
 * The user's balance in a group, shown at the end of its row. There are no
 * expenses yet, so nobody owes anything and every group reads "Settled up".
 * Real amounts ("you owe", "you are owed", one line per currency) replace this
 * once expenses exist.
 */
export function GroupBalance() {
  return <Text type="secondary">Settled up</Text>
}
