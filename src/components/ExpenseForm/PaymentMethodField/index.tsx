import { BankOutlined, CheckOutlined, CreditCardOutlined } from '@ant-design/icons'
import { Button, Card, Flex, theme, Typography } from 'antd'
import { useState, type ReactNode } from 'react'
import type { AccountKind } from '../../../db/types.ts'
import type { AccountSummary } from '../../../services/accountService/types.ts'
import { ICON_ONLY_SIZE } from '../../../theme/controlHeight.ts'
import { AccountHeading } from '../../AccountHeading'
import { AccountStats } from '../../AccountStats'
import { AdaptiveDialog } from '../../AdaptiveDialog'

const { Text } = Typography

type Props = {
  /** Given by the form item, so that its messages are tied to the button. */
  id?: string
  /** The id of the chosen account; empty or null for none. */
  value?: string | null
  onChange?: (accountId: string | null) => void
  /** The user's accounts, by name. */
  accounts: AccountSummary[]
}

/** The icon of a kind of account. */
function KindIcon({ kind }: { kind?: AccountKind }) {
  return kind === 'bank' ? <BankOutlined /> : <CreditCardOutlined />
}

/**
 * The expense's payment method (PRD 5.5): a full-width row like the date row,
 * showing "Payment method" until an account is chosen, then its name. It opens
 * a picker that lists the user's accounts as the same cards the accounts page
 * shows, with a "None" card to clear it. Works as an Ant Design form field.
 */
export function PaymentMethodField({ id, value, onChange, accounts }: Props) {
  const [open, setOpen] = useState(false)
  const { token } = theme.useToken()
  const chosen = accounts.find((account) => account.id === value)

  function pick(accountId: string | null) {
    onChange?.(accountId)
    setOpen(false)
  }

  /** One card of the picker, with the stats of a credit card under its heading; the chosen one has the app's green border and a tick. */
  function renderCard(key: string, label: string, selected: boolean, onPick: () => void, heading: ReactNode, stats: ReactNode = null) {
    return (
      <Card
        key={key}
        hoverable
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-pressed={selected}
        onClick={onPick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onPick()
          }
        }}
        style={selected ? { borderColor: token.colorPrimary } : undefined}
      >
        <Flex vertical gap={12}>
          <Flex align="center" justify="space-between" gap={12}>
            <div style={{ flex: 1, minWidth: 0 }}>{heading}</div>
            {selected && <CheckOutlined aria-hidden style={{ fontSize: ICON_ONLY_SIZE, color: token.colorPrimary }} />}
          </Flex>
          {stats}
        </Flex>
      </Card>
    )
  }

  return (
    <>
      <Button
        id={id}
        block
        icon={<KindIcon kind={chosen?.kind} />}
        aria-label={chosen ? `Payment method: ${chosen.name}` : 'Payment method'}
        onClick={() => setOpen(true)}
        // Looks like the date row: full width, the text at the start.
        style={{ justifyContent: 'flex-start' }}
      >
        {chosen ? chosen.name : <Text type="secondary">Payment method</Text>}
      </Button>
      <AdaptiveDialog open={open} onClose={() => setOpen(false)} title="Payment method">
        <Flex vertical gap={12}>
          {renderCard('none', 'None', !chosen, () => pick(null), <Text style={{ lineHeight: '40px' }}>None</Text>)}
          {accounts.map((account) =>
            renderCard(
              account.id,
              account.name,
              account.id === value,
              () => pick(account.id),
              <AccountHeading account={account} />,
              <AccountStats account={account} />,
            ),
          )}
        </Flex>
      </AdaptiveDialog>
    </>
  )
}
