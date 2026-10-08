import { Input, type InputRef } from 'antd'
import { useLayoutEffect, useRef, type ChangeEvent } from 'react'
import { moneyService } from '../../../../../services/moneyService'
import { caretAfter, keptBefore } from './utils.ts'

type Props = {
  /** Given by the form item, so that its messages are tied to the input. */
  id?: string
  /** The currency the amount is in; decides its decimals and digit grouping. */
  currency: string
  /** The amount cleaned to digits and one "." ('1234.5'), as the form holds it. */
  value?: string
  onChange?: (value: string) => void
}

/**
 * The amount of an expense in large type. Only digits and "." can be typed,
 * no more decimals than the currency has, and thousands separators appear as
 * the user types (lakhs for INR). Works as an Ant Design form field.
 */
export function AmountInput({ id, currency, value = '', onChange }: Props) {
  const inputRef = useRef<InputRef>(null)
  // After a change the field is reformatted, which would throw the caret to
  // the end; this remembers how many digits it came after, to put it back.
  const pendingCaret = useRef<number | null>(null)

  useLayoutEffect(() => {
    const kept = pendingCaret.current
    const element = inputRef.current?.input
    if (kept === null || !element) return
    pendingCaret.current = null
    const caret = caretAfter(element.value, kept)
    element.setSelectionRange(caret, caret)
  })

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const text = event.target.value
    pendingCaret.current = keptBefore(text, event.target.selectionStart ?? text.length)
    onChange?.(moneyService.cleanInput(text, currency))
  }

  return (
    <Input
      ref={inputRef}
      id={id}
      aria-label="Amount"
      inputMode="decimal"
      autoComplete="off"
      variant="underlined"
      placeholder={moneyService.placeholder(currency)}
      value={moneyService.formatInput(value, currency)}
      onChange={handleChange}
      style={{ fontSize: 32, fontWeight: 600 }}
    />
  )
}
