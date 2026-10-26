import { Flex, Typography } from 'antd'
import type { AccountKind } from '../../db/types.ts'
import { currencyService } from '../../services/currencyService'
import { AccountKindIcon } from '../AccountKindIcon'
import { ACCOUNT_KIND_LABELS } from '../AccountKindIcon/content.ts'

const { Text } = Typography

type Props = {
  account: { kind: AccountKind; name: string; currency: string }
}

/**
 * An account's icon tile with its name and, under it, "£ · Bank account": the currency as the group list shows it
 * ("£", "US$", or its code where no symbol tells it apart), then the kind. Two lines of 20 px, as high as the 40 px icon.
 * Shared by the accounts page's cards and the payment method picker.
 */
export function AccountHeading({ account }: Props) {
  const currency = currencyService.symbol(account.currency, navigator.language) ?? account.currency

  return (
    <Flex align="center" gap={12} style={{ minWidth: 0 }}>
      <AccountKindIcon kind={account.kind} />
      <Flex vertical flex={1} style={{ minWidth: 0 }}>
        <Text strong ellipsis style={{ lineHeight: '20px' }}>
          {account.name}
        </Text>
        <Text type="secondary" ellipsis style={{ lineHeight: '20px' }}>
          {currency} · {ACCOUNT_KIND_LABELS[account.kind]}
        </Text>
      </Flex>
    </Flex>
  )
}
