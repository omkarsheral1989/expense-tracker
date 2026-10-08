import { Flex, Typography } from 'antd'
import { useColorScheme } from '../../../../../../hooks/useColorScheme'
import type { CurrencyBalance } from '../../../../../../services/expenseService/types.ts'
import { moneyService } from '../../../../../../services/moneyService'
import { OWED_TO_YOU_COLOR, YOU_OWE_COLOR } from '../../../../../../theme/balanceColors.ts'

const { Text } = Typography

type Props = {
  /** The user's overall balance in the group, one entry per currency not settled. */
  balances: CurrencyBalance[]
}

/**
 * The user's balance in a group, shown at the end of its row: "you are owed"
 * over "£12.00" in green, or "you owe" over "₹500.00" in orange-red, once per
 * currency, or "Settled up" when nothing is owed either way.
 */
export function GroupBalance({ balances }: Props) {
  const scheme = useColorScheme()

  function renderBalance(balance: CurrencyBalance) {
    const owedToYou = balance.amountMinor > 0
    return (
      <Flex
        key={balance.currency}
        vertical
        align="flex-end"
        style={{ color: owedToYou ? OWED_TO_YOU_COLOR[scheme] : YOU_OWE_COLOR[scheme], lineHeight: 1.3 }}
      >
        <span style={{ fontSize: 12 }}>{owedToYou ? 'you are owed' : 'you owe'}</span>
        <strong style={{ whiteSpace: 'nowrap' }}>
          {moneyService.format(Math.abs(balance.amountMinor), balance.currency)}
        </strong>
      </Flex>
    )
  }

  if (balances.length === 0) return <Text type="secondary">Settled up</Text>

  return (
    <Flex vertical align="flex-end" gap={6} style={{ flex: 'none', textAlign: 'end' }}>
      {balances.map(renderBalance)}
    </Flex>
  )
}
