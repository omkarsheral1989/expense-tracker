import { Icon } from '../Icon'
import { Button } from 'antd'
import { useState } from 'react'
import { AdaptiveDialog } from '../AdaptiveDialog'
import { dateService } from '../../services/dateService'
import { MonthCalendar } from './MonthCalendar'

type Props = {
  /** Given by the form item, so that its messages are tied to the button. */
  id?: string
  /** 'YYYY-MM-DD'. */
  value?: string
  onChange?: (day: string) => void
}

/**
 * The day of the expense, written out ("Today, 8 Oct 2026") in a box like the
 * other fields; tapping it opens a calendar that moves between months by
 * swiping, scrolling or arrows. Any day can be chosen. Works as an Ant Design
 * form field.
 */
export function DateField({ id, value = dateService.toDay(new Date()), onChange }: Props) {
  const [open, setOpen] = useState(false)
  const shown = dateService.formatDay(value, dateService.toDay(new Date()))

  return (
    <>
      <Button
        id={id}
        block
        icon={<Icon name="calendar" />}
        aria-label={`Date: ${shown}`}
        onClick={() => setOpen(true)}
        // Looks like the text boxes around it: full width, the text at the start.
        style={{ justifyContent: 'flex-start' }}
      >
        {shown}
      </Button>
      <AdaptiveDialog open={open} onClose={() => setOpen(false)} title="Choose a date">
        {/* Starts at the chosen day but is not held there, so it can move to
            other months. The dialog is rebuilt on every opening. */}
        <MonthCalendar
          selected={dateService.fromDay(value)}
          onSelect={(day) => {
            onChange?.(dateService.toDay(day))
            setOpen(false)
          }}
        />
      </AdaptiveDialog>
    </>
  )
}
