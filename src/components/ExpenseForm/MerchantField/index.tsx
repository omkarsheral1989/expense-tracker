import { AutoComplete, Input } from 'antd'
import { EXPENSE_MERCHANT_MAX_LENGTH } from '../../../db/constants.ts'
import { Icon } from '../../Icon'
import { matchingMerchants } from './utils.ts'

type Props = {
  /** Given by the form item, so that its messages are tied to the input. */
  id?: string
  value?: string
  onChange?: (merchant: string) => void
  /** The names to suggest, in the order to list them. */
  merchants: string[]
}

/**
 * The expense's merchant (PRD 5.5): where it was bought, a shop, app or
 * website. Typing filters the known names; any other text is a new name.
 * Works as an Ant Design form field.
 */
export function MerchantField({ id, value, onChange, merchants }: Props) {
  const options = matchingMerchants(merchants, value ?? '').map((merchant) => ({ value: merchant }))
  return (
    <AutoComplete
      id={id}
      value={value ?? ''}
      options={options}
      onChange={onChange}
      style={{ width: '100%' }}
      // A name shown only to filter, never a new one: the list is closed when nothing matches.
      notFoundContent={null}
    >
      <Input
        aria-label="Merchant"
        placeholder="Shop or app"
        maxLength={EXPENSE_MERCHANT_MAX_LENGTH}
        prefix={<Icon name="store" />}
        allowClear
        // Lines up with the date and payment method rows: the icon 15 px in, the text 8 px after it.
        style={{ paddingInline: 15 }}
        styles={{ prefix: { marginInlineEnd: 8 } }}
      />
    </AutoComplete>
  )
}
