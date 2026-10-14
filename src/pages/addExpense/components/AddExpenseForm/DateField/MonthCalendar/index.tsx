import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { Button, Flex, Select } from 'antd'
import { useEffect, useRef, useState, type TouchEvent } from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'
import styles from './style.module.css'
import { monthChangeOfSwipe, monthChangeOfWheel, shortMonthNames } from './utils.ts'

/** Years offered in the year list, either side of the one shown. */
const YEARS_EACH_SIDE = 10
/** Pause after a scroll moved the month, so one wheel flick moves one month, not ten. */
const WHEEL_PAUSE_MS = 350

type Props = {
  /** The day shown as chosen, and the month the calendar starts on. */
  selected: Date
  /** Called with the day the user taps. */
  onSelect: (day: Date) => void
}

/**
 * A month calendar (react-day-picker) that moves to other months, sliding, by
 * swiping sideways, scrolling the wheel or trackpad over it, or with the
 * arrows beside the month and year lists. Moving never chooses a day.
 */
export function MonthCalendar({ selected, onSelect }: Props) {
  // The month on screen (its first day). The chosen day is lit only in its own month.
  const [shown, setShown] = useState(() => startOfMonth(selected))
  const wrapper = useRef<HTMLDivElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const lastWheelMove = useRef(0)

  function moveMonths(count: number) {
    setShown((month) => new Date(month.getFullYear(), month.getMonth() + count, 1))
  }

  // Registered by hand: React's own wheel handlers are passive, so they
  // could not keep the sheet from scrolling while the month moves.
  useEffect(() => {
    const element = wrapper.current
    if (!element) return
    function handleWheel(event: WheelEvent) {
      const change = monthChangeOfWheel(event.deltaX, event.deltaY)
      if (change === 0) return
      event.preventDefault()
      const now = Date.now()
      if (now - lastWheelMove.current < WHEEL_PAUSE_MS) return
      lastWheelMove.current = now
      moveMonths(change)
    }
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [])

  function handleTouchStart(event: TouchEvent) {
    const touch = event.touches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY }
  }

  function handleTouchEnd(event: TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const touch = event.changedTouches[0]
    const change = monthChangeOfSwipe(touch.clientX - start.x, touch.clientY - start.y)
    if (change !== 0) moveMonths(change)
  }

  function renderHeader() {
    const years = Array.from({ length: YEARS_EACH_SIDE * 2 + 1 }, (_, index) => shown.getFullYear() - YEARS_EACH_SIDE + index)
    return (
      <Flex gap={8} align="center" style={{ paddingBottom: 12 }}>
        <Button icon={<LeftOutlined />} aria-label="Previous month" onClick={() => moveMonths(-1)} />
        <Select
          aria-label="Year"
          value={shown.getFullYear()}
          options={years.map((year) => ({ value: year, label: String(year) }))}
          onChange={(year) => setShown(new Date(year, shown.getMonth(), 1))}
          style={{ flex: 1 }}
        />
        <Select
          aria-label="Month"
          value={shown.getMonth()}
          options={shortMonthNames(navigator.language).map((label, index) => ({ value: index, label }))}
          onChange={(month) => setShown(new Date(shown.getFullYear(), month, 1))}
          style={{ flex: 1 }}
        />
        <Button icon={<RightOutlined />} aria-label="Next month" onClick={() => moveMonths(1)} />
      </Flex>
    )
  }

  return (
    <div
      ref={wrapper}
      className={styles.calendar}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {renderHeader()}
      <DayPicker
        mode="single"
        required
        selected={selected}
        onSelect={onSelect}
        month={shown}
        onMonthChange={setShown}
        animate
        fixedWeeks
        showOutsideDays
        hideNavigation
        // Our own header above shows the month; the library's label is only for screen readers.
        classNames={{ month_caption: styles.captionForScreenReaders }}
      />
    </div>
  )
}

function startOfMonth(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), 1)
}
