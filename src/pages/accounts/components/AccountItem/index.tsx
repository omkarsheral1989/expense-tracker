import { Card, Flex, Progress, theme, Typography } from 'antd'
import type { ReactNode } from 'react'
import { currencyService } from '../../../../services/currencyService'
import { moneyService } from '../../../../services/moneyService'
import type { AccountSummary } from '../../../../services/accountService/types.ts'
import { CARD_PADDING } from '../../../../theme/cardPadding.ts'
import { RADIUS } from '../../../../theme/radius.ts'
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
 * colored tile with a bank or card icon, the name and "₹ · Credit card". A
 * credit card also shows its spend against its target, its credit limit with
 * the share of it spent this statement cycle, and the expenses it could not
 * count (PRD 5.17).
 */
export function AccountItem({ account, onEdit }: Props) {
  const { token } = theme.useToken()
  const { spend } = account
  // The currency as the group list shows it ("£", "US$"), or its code where no symbol tells it apart.
  const currency = currencyService.symbol(account.currency, navigator.language) ?? account.currency

  /** One small tile of the card: a label and a value (with an optional ring at their end, as high as the two), and a line under them. */
  function renderTile(key: string, label: string, value: string, note: string | null, ring: ReactNode = null) {
    return (
      <Flex
        key={key}
        vertical
        gap={2}
        style={{ flex: 1, minWidth: 0, padding: CARD_PADDING, borderRadius: RADIUS.inner, background: token.colorBgLayout }}
      >
        <Flex align="center" justify="space-between" gap={8}>
          <Flex vertical style={{ minWidth: 0 }}>
            <Text type="secondary">{label}</Text>
            <Text strong style={{ overflowWrap: 'anywhere' }}>
              {value}
            </Text>
          </Flex>
          {ring}
        </Flex>
        {note && <Text type="secondary">{note}</Text>}
      </Flex>
    )
  }

  // A ring for how much of an amount is spent, as high as the label and the amount beside it (two 22 px lines), with the
  // whole percentage in the middle (red once past it).
  function renderRing(spent: number, of: number, what: string) {
    const percent = Math.round((spent / of) * 100)
    return (
      <Progress
        type="circle"
        size={44}
        strokeWidth={10}
        percent={Math.min(100, percent)}
        // The real share, also past 100%. A fixed status keeps Ant Design from swapping it for a tick or a cross.
        format={() => `${percent}%`}
        status="normal"
        // Ant Design draws a normal ring in its info blue; the app's green is its primary color.
        strokeColor={spent > of ? token.colorError : token.colorPrimary}
        aria-label={`${percent}% of the ${what}`}
      />
    )
  }

  // This period's spend against the target.
  function renderTargetTile() {
    if (!spend?.target || account.spendTargetMinor === null) return null
    return renderTile(
      'target',
      'Spend target',
      moneyService.format(account.spendTargetMinor, account.currency),
      `${moneyService.format(spend.targetSpentMinor, account.currency)} spent ${SPEND_TARGET_LABELS[spend.target.period].this}`,
      renderRing(spend.targetSpentMinor, account.spendTargetMinor, 'target'),
    )
  }

  // The credit limit, and the share of it spent in this statement cycle (repayments are not recorded, so it is not what is owed).
  function renderLimitTile() {
    if (!spend || account.creditLimitMinor === null) return null
    return renderTile(
      'limit',
      'Credit limit',
      moneyService.format(account.creditLimitMinor, account.currency),
      `${moneyService.format(spend.cycleSpentMinor, account.currency)} spent this cycle`,
      renderRing(spend.cycleSpentMinor, account.creditLimitMinor, 'limit'),
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
              {currency} · {ACCOUNT_KIND_LABELS[account.kind]}
            </Text>
          </Flex>
        </Flex>
        {spend && (
          <Flex vertical gap={8}>
            <Flex gap={8}>
              {renderTargetTile()}
              {renderLimitTile()}
            </Flex>
            {renderSkipped()}
          </Flex>
        )}
      </Flex>
    </Card>
  )
}
