import { Card, Flex } from 'antd'
import { AccountHeading } from '../../../../components/AccountHeading'
import { AccountStats } from '../../../../components/AccountStats'
import type { AccountSummary } from '../../../../services/accountService/types.ts'

type Props = {
  account: AccountSummary
  /** Opens the edit dialog for this account. */
  onEdit: (account: AccountSummary) => void
}

/**
 * One account on the accounts page, as a card that opens the edit dialog: a
 * colored tile with a bank or card icon, the name and "₹ · Credit card". A
 * credit card also shows what it has spent against its target and its credit
 * limit (PRD 5.17).
 */
export function AccountItem({ account, onEdit }: Props) {
  return (
    <Card
      hoverable
      role="button"
      tabIndex={0}
      aria-label={`Edit ${account.name}`}
      onClick={() => onEdit(account)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onEdit(account)
        }
      }}
    >
      <Flex vertical gap={12}>
        <AccountHeading account={account} />
        <AccountStats account={account} />
      </Flex>
    </Card>
  )
}
