import { Button } from 'antd'
import { useState } from 'react'
import { CategoryIcon } from '../../../../../components/CategoryIcon'
import { expenseService } from '../../../../../services/expenseService'
import { CategoryPicker } from './CategoryPicker'

type Props = {
  /** Given by the form item, so that its messages are tied to the button. */
  id?: string
  /** A category key such as 'food.dining_out'. */
  value?: string
  onChange?: (key: string) => void
}

/**
 * The expense's category as a tile; tapping it opens the list of categories.
 * Works as an Ant Design form field.
 */
export function CategoryField({ id, value = expenseService.defaultCategory, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const { label, groupLabel } = expenseService.categoryOf(value)

  function handlePick(key: string) {
    onChange?.(key)
    setOpen(false)
  }

  return (
    <>
      <Button
        id={id}
        type="text"
        aria-label={`Category: ${label === 'Other' ? `${groupLabel}: Other` : label}`}
        onClick={() => setOpen(true)}
        style={{ width: 'auto', height: 'auto', padding: 0 }}
      >
        <CategoryIcon category={value} size={48} />
      </Button>
      <CategoryPicker
        open={open}
        onClose={() => setOpen(false)}
        value={value}
        onPick={handlePick}
      />
    </>
  )
}
