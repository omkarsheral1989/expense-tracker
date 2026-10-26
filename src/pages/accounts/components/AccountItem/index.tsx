import { Card, Flex, Progress, theme, Typography } from 'antd'
import { useColorScheme } from '../../../../hooks/useColorScheme'
import { moneyService } from '../../../../services/moneyService'
import type { AccountSummary } from '../../../../services/accountService/types.ts'
import { YOU_OWE_COLOR } from '../../../../theme/balanceColors.ts'
import { ACCOUNT_KIND_LABELS, SPEND_TARGET_LABELS } from '../../content.ts'
import { AccountKindIcon } from '../AccountKindIcon'

const { Text } = Typography

type Props = {
  account: AccountSummary
  /** Opens the edit dialog for this account. */
  onEdit: (account: AccountSummary) => void
}

/**
 * One account on the accounts page, as a card that opens the edit dialog: a
 * colored tile with a bank or card icon, the name and "Credit card · INR". A
 * credit card also shows its spend against its target, its credit limit with
 * the share of it spent this statement cycle, and the expenses it could not
 * count (PRD 5.17).
 */
export function AccountItem({ account, onEdit }: Props) {
  const scheme = useColorScheme()
  const { token } = theme.useToken()
  const { spend } = account

  function renderTarget() {
    if (!spend?.target || account.spendTargetMinor === null) return null
    const spent = spend.targetSpentMinor
    const over = spent > account.spendTargetMinor
    return (
      <div>
        <Progress
          percent={Math.min(100, Math.round((spent / account.spendTargetMinor) * 100))}
          showInfo={false}
          status={over ? 'exception' : 'normal'}
          // Ant Design draws a normal bar in its info blue; the app's green is its primary color.
          strokeColor={over ? undefined : token.colorPrimary}
          size="small"
        />
        <Text style={over ? { color: YOU_OWE_COLOR[scheme] } : undefined}>
          {moneyService.format(spent, account.currency)} of {moneyService.format(account.spendTargetMinor, account.currency)}{' '}
          {SPEND_TARGET_LABELS[spend.target.period].this}
        </Text>
      </div>
    )
  }

  function renderLimit() {
    if (!spend || account.creditLimitMinor === null) return null
    const percent = Math.round((spend.cycleSpentMinor / account.creditLimitMinor) * 100)
    return (
      <Flex vertical>
        <Text type="secondary">Limit {moneyService.format(account.creditLimitMinor, account.currency)}</Text>
        <Text type="secondary">
          {moneyService.format(spend.cycleSpentMinor, account.currency)} spent this statement cycle ({percent}%)
        </Text>
      </Flex>
    )
  }

  function renderSkipped() {
    if (!spend || spend.skipped === 0) return null
    return (
      <Text type="secondary">
        {spend.skipped === 1
          ? '1 expense in another currency has no charged amount and is not counted.'
          : `${spend.skipped} expenses in other currencies have no charged amount and are not counted.`}
      </Text>
    )
  }

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
        <Flex align="center" gap={12}>
          <AccountKindIcon kind={account.kind} />
          {/* Two lines of 20 px, so the text is as high as the 40 px icon beside it. */}
          <Flex vertical flex={1} style={{ minWidth: 0 }}>
            <Text strong ellipsis style={{ lineHeight: '20px' }}>
              {account.name}
            </Text>
            <Text type="secondary" ellipsis style={{ lineHeight: '20px' }}>
              {ACCOUNT_KIND_LABELS[account.kind]} · {account.currency}
            </Text>
          </Flex>
        </Flex>
        {spend && (
          <Flex vertical gap={8}>
            {renderTarget()}
            {renderLimit()}
            {renderSkipped()}
          </Flex>
        )}
      </Flex>
    </Card>
  )
}
