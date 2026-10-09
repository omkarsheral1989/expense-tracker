import { Button } from 'antd'
import { useState } from 'react'
import { CurrencyPicker } from './CurrencyPicker'

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
 * The expense's currency as a button with its code; tapping it opens the list
 * of currencies. Works as an Ant Design form field.
 */
export function CurrencyField({ id, value = '', onChange, recentCodes }: Props) {
  const [open, setOpen] = useState(false)

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
        style={{ width: 72, fontWeight: 600 }}
      >
        {value}
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
