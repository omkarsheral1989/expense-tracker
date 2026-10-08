import { CalendarOutlined } from '@ant-design/icons'
import { Button, Calendar } from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'
import { AdaptiveDialog } from '../../../../../components/AdaptiveDialog'
import { formatDay, toDay } from '../utils.ts'

type Props = {
  /** Given by the form item, so that its messages are tied to the button. */
  id?: string
  /** 'YYYY-MM-DD'. */
  value?: string
  onChange?: (day: string) => void
}

/**
 * The day of the expense, written out ("Today, 8 Oct 2026"); tapping it opens
 * a calendar. Any day can be chosen. Works as an Ant Design form field.
 */
export function DateField({ id, value = toDay(new Date()), onChange }: Props) {
  const [open, setOpen] = useState(false)
  const shown = formatDay(value, toDay(new Date()))

  return (
    <>
      <Button
        id={id}
        type="text"
        icon={<CalendarOutlined />}
        aria-label={`Date: ${shown}`}
        onClick={() => setOpen(true)}
        style={{ paddingInline: 8 }}
      >
        {shown}
      </Button>
      <AdaptiveDialog open={open} onClose={() => setOpen(false)} title="Choose a date">
        {/* Starts at the chosen day but is not held there, so its header can
            move it to other months. The dialog is rebuilt on every opening. */}
        <Calendar
          fullscreen={false}
          defaultValue={dayjs(value)}
          onSelect={(date, { source }) => {
            // Changing the month or year in the header only moves the calendar.
            if (source !== 'date') return
            onChange?.(date.format('YYYY-MM-DD'))
            setOpen(false)
          }}
        />
      </AdaptiveDialog>
    </>
  )
}
