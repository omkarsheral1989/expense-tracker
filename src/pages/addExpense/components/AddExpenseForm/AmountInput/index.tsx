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
  /** What screen readers call the field. */
  label?: string
  /**
   * True for the amount of the expense itself: large type on an underline.
   * False for a smaller boxed field, such as one person's amount in the split.
   */
  large?: boolean
  /** Shown before the number inside a small field, such as "+" for an adjustment. */
  prefix?: string
}

/**
 * The amount of an expense in large type. Only digits and "." can be typed,
 * no more decimals than the currency has, and thousands separators appear as
 * the user types (lakhs for INR). Works as an Ant Design form field.
 */
export function AmountInput({
  id,
  currency,
  value = '',
  onChange,
  label = 'Amount',
  large = true,
  prefix,
}: Props) {
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
      aria-label={label}
      inputMode="decimal"
      autoComplete="off"
      variant={large ? 'underlined' : 'outlined'}
      prefix={prefix}
      placeholder={moneyService.placeholder(currency)}
      value={moneyService.formatInput(value, currency)}
      onChange={handleChange}
      style={large ? { fontSize: 32, fontWeight: 600 } : undefined}
      styles={large ? undefined : { input: { textAlign: 'end' } }}
    />
  )
}
