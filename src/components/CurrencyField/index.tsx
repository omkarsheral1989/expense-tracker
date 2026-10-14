import { Button } from 'antd'
import { useState } from 'react'
import { CONTROL_HEIGHT } from '../../theme/controlHeight.ts'
import { currencyService } from '../../services/currencyService'
import { CurrencyPicker } from './CurrencyPicker'
import { labelFontSize } from './utils.ts'

type Props = {
  /** Given by the form item, so that its messages are tied to the button. */
  id?: string
  /** An ISO 4217 code such as 'INR'. */
  value?: string
  onChange?: (code: string) => void
  /** Listed first in the picker: the group's currency and the user's latest ones. */
  recentCodes: string[]
}

/**
 * The expense's currency as a 40 px square button showing its symbol ('$'), or
 * its code when the language has no symbol for it; tapping it opens the list of
 * currencies. Works as an Ant Design form field.
 */
export function CurrencyField({ id, value = '', onChange, recentCodes }: Props) {
  const [open, setOpen] = useState(false)
  const label = currencyService.symbol(value, navigator.language) ?? value

  function handlePick(code: string) {
    onChange?.(code)
    setOpen(false)
  }

  return (
    <>
      <Button
        id={id}
        size="large"
        aria-label={`Currency: ${value}`}
        onClick={() => setOpen(true)}
        // A square, with the text shrunk to fit it.
        style={{ width: CONTROL_HEIGHT, paddingInline: 0, fontWeight: 600, fontSize: labelFontSize(label) }}
      >
        {label}
      </Button>
      <CurrencyPicker
        open={open}
        onClose={() => setOpen(false)}
        value={value}
        recentCodes={recentCodes}
        onPick={handlePick}
      />
    </>
  )
}
