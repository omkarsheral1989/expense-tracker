import { Segmented } from 'antd'
import { ACCOUNT_KINDS } from '../../../../../db/constants.ts'
import type { AccountKind } from '../../../../../db/types.ts'
import { CONTROL_HEIGHT } from '../../../../../theme/controlHeight.ts'
import { AccountKindIcon } from '../../../../../components/AccountKindIcon'

type Props = {
  /** Given by the form item, so that its label is tied to the control. */
  id?: string
  value?: AccountKind
  onChange?: (kind: AccountKind) => void
  /** Switches the tiles off, for an account whose type cannot change. */
  disabled?: boolean
}

/** Pick the kind of account from two tiles, like the group types of Create group. Works as an Ant Design form field. */
export function AccountKindSelector({ id, value, onChange, disabled }: Props) {
  return (
    <Segmented<AccountKind>
      id={id}
      block
      className="account-kind-selector"
      style={{ background: 'transparent' }}
      value={value}
      onChange={onChange}
      disabled={disabled}
      options={ACCOUNT_KINDS.map((kind) => ({
        value: kind,
        label: (
          <div style={{ padding: '8px 0' }}>
            <AccountKindIcon kind={kind} size={CONTROL_HEIGHT} withLabel />
          </div>
        ),
      }))}
    />
  )
}
