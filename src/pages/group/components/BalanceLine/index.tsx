import { Typography } from 'antd'

const { Text } = Typography

/**
 * What the user owes or is owed in this group, as one sentence under the band.
 * There are no expenses yet, so nobody owes anything. Later it becomes a
 * sentence such as "Priya owes you ₹14,517.50", with the amount in bold green.
 */
export function BalanceLine() {
  return <Text style={{ fontSize: 18 }}>You&apos;re all settled up</Text>
}
