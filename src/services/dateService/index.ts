import { FULL_MONTH_NAMES, MONTH_NAMES, WEEKDAY_NAMES } from './constants.ts'

/** A day as 'YYYY-MM-DD', in the device's own time zone. */
function toDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 'YYYY-MM-DD' as a local date at midnight. */
function fromDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

/**
 * How a day is written: "Today, 8 Oct 2026", "Yesterday, 7 Oct 2026", or the
 * weekday for any other day ("Mon, 5 Oct 2026"). `today` is a 'YYYY-MM-DD'
 * too, so the result does not depend on the clock.
 */
function formatDay(day: string, today: string): string {
  const date = fromDay(day)
  const yesterday = fromDay(today)
  yesterday.setDate(yesterday.getDate() - 1)

  let prefix: string = WEEKDAY_NAMES[date.getDay()]
  if (day === today) prefix = 'Today'
  else if (day === toDay(yesterday)) prefix = 'Yesterday'

  return `${prefix}, ${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
}

/** The month a day is in, written out: "September 2025". */
function formatMonth(day: string): string {
  const date = fromDay(day)
  return `${FULL_MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * A moment as "20 Oct 2026, 3:45 pm": the day written as elsewhere in the app,
 * the time in the language and clock style of `locale` (a 24-hour clock where
 * that is the custom).
 */
function formatDateTime(moment: Date, locale: string): string {
  const day = `${moment.getDate()} ${MONTH_NAMES[moment.getMonth()]} ${moment.getFullYear()}`
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(moment)
  return `${day}, ${time}`
}

/** Days ('YYYY-MM-DD', without a time) as the app writes and reads them. */
export const dateService = {
  toDay,
  fromDay,
  formatDay,
  formatMonth,
  formatDateTime,
}
