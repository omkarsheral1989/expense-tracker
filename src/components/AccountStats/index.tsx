import { Flex, Progress, theme, Typography } from 'antd'
import type { ReactNode } from 'react'
import type { AccountSummary } from '../../services/accountService/types.ts'
import { moneyService } from '../../services/moneyService'
import { CARD_PADDING } from '../../theme/cardPadding.ts'
import { RADIUS } from '../../theme/radius.ts'
import { SPEND_TARGET_LABELS } from './content.ts'

const { Text } = Typography

type Props = {
  account: AccountSummary
}

/**
 * What a credit card has spent (PRD 5.17): two tiles side by side, the spend target and the credit limit, each with the
 * amount, what has been spent, and a ring with the whole percentage in the middle; and the expenses it could not
 * count. Nothing for a bank account, or for a card with neither a target nor a limit. Shared by the accounts page's
 * cards and the payment method picker.
 */
export function AccountStats({ account }: Props) {
  const { token } = theme.useToken()
  const { spend } = account

  /** One small tile: a label and a value (with an optional ring at their end, as high as the two), and a line under them. */
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
        // The real share, also past 100% and at 100% (Ant Design would show a tick there, but not when it is given a format).
        format={() => `${percent}%`}
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

  if (!spend) return null

  return (
    <Flex vertical gap={8}>
      <Flex gap={8}>
        {renderTargetTile()}
        {renderLimitTile()}
      </Flex>
      {renderSkipped()}
    </Flex>
  )
}
