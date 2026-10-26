import { BankOutlined, CheckOutlined, CreditCardOutlined } from '@ant-design/icons'
import { Button, Flex, Typography } from 'antd'
import { useState } from 'react'
import type { AccountKind } from '../../../db/types.ts'
import type { AccountOption } from '../../../services/accountService/types.ts'
import { ICON_ONLY_SIZE } from '../../../theme/controlHeight.ts'
import { AdaptiveDialog } from '../../AdaptiveDialog'

const { Text } = Typography

type Props = {
  /** Given by the form item, so that its messages are tied to the button. */
  id?: string
  /** The id of the chosen account; empty or null for none. */
  value?: string | null
  onChange?: (accountId: string | null) => void
  /** The user's accounts, by name. */
  accounts: AccountOption[]
}

/** The icon of a kind of account. */
function KindIcon({ kind }: { kind?: AccountKind }) {
  return kind === 'bank' ? <BankOutlined /> : <CreditCardOutlined />
}

/**
 * The expense's payment method (PRD 5.5): a full-width row like the date row,
 * showing "Payment method" until an account is chosen, then its name. It opens
 * a picker of the user's accounts with a "None" entry to clear it. Works as an
 * Ant Design form field.
 */
export function PaymentMethodField({ id, value, onChange, accounts }: Props) {
  const [open, setOpen] = useState(false)
  const chosen = accounts.find((account) => account.id === value)

  function pick(accountId: string | null) {
    onChange?.(accountId)
    setOpen(false)
  }

  function renderOption(account: AccountOption) {
    const selected = account.id === value
    return (
      <Button
        key={account.id}
        type="text"
        block
        aria-pressed={selected}
        onClick={() => pick(account.id)}
        style={{ justifyContent: 'space-between', height: 'auto', padding: '10px 12px' }}
      >
        <Flex vertical align="flex-start">
          <span>{account.name}</span>
          <Text type="secondary">
            {account.kind === 'bank' ? 'Bank account' : 'Credit card'} · {account.currency}
          </Text>
        </Flex>
        {selected && <CheckOutlined aria-hidden style={{ fontSize: ICON_ONLY_SIZE }} />}
      </Button>
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
        <Flex vertical gap={2}>
          <Button
            type="text"
            block
            aria-pressed={!chosen}
            onClick={() => pick(null)}
            style={{ justifyContent: 'space-between', height: 'auto', padding: '10px 12px' }}
          >
            <span>None</span>
            {!chosen && <CheckOutlined aria-hidden style={{ fontSize: ICON_ONLY_SIZE }} />}
          </Button>
          {accounts.map(renderOption)}
        </Flex>
      </AdaptiveDialog>
    </>
  )
}
