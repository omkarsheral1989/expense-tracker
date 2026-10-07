import { Select } from 'antd'
import { currencyService } from '../../../../../services/currencyService'

type Props = {
  /** Shown at the top of the list: the currency of the user's region. */
  firstCode?: string | null
  value?: string
  onChange?: (code: string) => void
}

/** Search every ISO currency by code or name. Works as an Ant Design form field. */
export function CurrencySelect({ firstCode, value, onChange }: Props) {
  return (
    <Select
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
