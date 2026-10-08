import { Select } from 'antd'
import { currencyService } from '../../../../../services/currencyService'

type Props = {
  /** Given by the form item, so that its label is tied to the input. */
  id?: string
  /** Shown at the top of the list: the currency of the user's region. */
  firstCode?: string | null
  value?: string
  onChange?: (code: string) => void
}

/** Search every ISO currency by code or name. Works as an Ant Design form field. */
export function CurrencySelect({ id, firstCode, value, onChange }: Props) {
  return (
    <Select
      id={id}
      showSearch
      placeholder="Choose a currency"
      // The label holds the code and the name, so both can be searched.
      optionFilterProp="label"
      options={currencyService.options(navigator.language, firstCode)}
      value={value}
      onChange={onChange}
    />
  )
}
