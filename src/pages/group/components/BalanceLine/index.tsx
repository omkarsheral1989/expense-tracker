import { Flex, Typography } from 'antd'
import { useColorScheme } from '../../../../hooks/useColorScheme'
import type { PersonBalance } from '../../../../services/expenseService/types.ts'
import { groupService } from '../../../../services/groupService'
import { moneyService } from '../../../../services/moneyService'
import { OWED_TO_YOU_COLOR, YOU_OWE_COLOR } from '../../../../theme/balanceColors.ts'

const { Text } = Typography

type Props = {
  /** One entry per person and currency that is not settled, in the order to show. */
  balances: PersonBalance[]
}

/**
 * What the user owes or is owed in this group, one sentence per person and
 * currency: "Priya owes you £14.50" (amount in bold green) or "You owe Sam
 * ₹200.00" (amount in bold orange-red). "You're all settled up" when nobody
 * owes anything.
 */
export function BalanceLine({ balances }: Props) {
  const scheme = useColorScheme()

  function renderBalance(balance: PersonBalance) {
    const name = groupService.shortName(balance)
    const owedToYou = balance.amountMinor > 0
    const amount = (
      <strong style={{ color: owedToYou ? OWED_TO_YOU_COLOR[scheme] : YOU_OWE_COLOR[scheme] }}>
        {moneyService.format(Math.abs(balance.amountMinor), balance.currency)}
      </strong>
    )
    return (
      <Text key={`${balance.personId}-${balance.currency}`} style={{ fontSize: 16 }}>
        {owedToYou ? <>{name} owes you {amount}</> : <>You owe {name} {amount}</>}
      </Text>
    )
  }

  if (balances.length === 0) {
    return <Text style={{ fontSize: 18 }}>You&apos;re all settled up</Text>
  }

  return (
    <Flex vertical gap={4}>
      {balances.map(renderBalance)}
    </Flex>
  )
}
