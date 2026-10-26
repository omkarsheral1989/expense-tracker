import type { SpendTargetPeriod } from '../../db/types.ts'
import { dateService } from '../dateService'
import type { Period } from './types.ts'

/** The months a quarter's spend target period can start in (January, April, July, October), counted from 0. */
const QUARTER_START_MONTHS = [0, 3, 6, 9]

/** How a name is compared for "already have an account called …": case and extra spaces do not count. */
export function comparableName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** The day before `day`'s date at `months` months later, so a period that starts on the 15th ends on the 14th. */
function dayBeforeMonthsLater(start: Date, months: number): string {
  const end = new Date(start.getFullYear(), start.getMonth() + months, start.getDate())
  end.setDate(end.getDate() - 1)
  return dateService.toDay(end)
}

/**
 * The statement cycle (a month) that `today` is in, both ends included: it
 * starts on the statement day and ends the day before the next one. With no
 * statement day it is the calendar month. `statementDay` is 1 to 28, so every
 * month has it.
 */
export function monthPeriod(today: string, statementDay: number | null): Period {
  const day = statementDay ?? 1
  const now = dateService.fromDay(today)
  const start = new Date(now.getFullYear(), now.getMonth() - (now.getDate() >= day ? 0 : 1), day)
  return { start: dateService.toDay(start), end: dayBeforeMonthsLater(start, 1) }
}

/**
 * The quarter that `today` is in: it starts on the statement day (the 1st
 * without one) of January, April, July or October, the latest of those not
 * after today, and ends the day before three months later.
 */
export function quarterPeriod(today: string, statementDay: number | null): Period {
  const day = statementDay ?? 1
  const now = dateService.fromDay(today)
  const candidates = [now.getFullYear() - 1, now.getFullYear()].flatMap((year) =>
    QUARTER_START_MONTHS.map((month) => new Date(year, month, day)),
  )
  const start = candidates.filter((candidate) => candidate.getTime() <= now.getTime()).at(-1)!
  return { start: dateService.toDay(start), end: dayBeforeMonthsLater(start, 3) }
}

/** The current period of a spend target. */
export function periodOf(kind: SpendTargetPeriod, today: string, statementDay: number | null): Period {
  return kind === 'month' ? monthPeriod(today, statementDay) : quarterPeriod(today, statementDay)
}

/** Whether a day ('YYYY-MM-DD') is inside a period. */
export function inPeriod(day: string, period: Period): boolean {
  return day >= period.start && day <= period.end
}

/**
 * What one expense adds to an account's spend: the amount the account was
 * debited when that was entered, else what the user paid when the expense is in
 * the account's currency. An expense in another currency with no debited amount
 * cannot be counted: `counted` is null (PRD 4.10).
 */
export function spendOf(
  expense: { currency: string; paidMinor: number; chargedMinor: number | null },
  accountCurrency: string,
): { counted: number | null } {
  if (expense.paidMinor <= 0) return { counted: 0 }
  if (expense.chargedMinor !== null) return { counted: expense.chargedMinor }
  return { counted: expense.currency === accountCurrency ? expense.paidMinor : null }
}

/**
 * The exchange rate an expense was paid at, worked out from its amount and what the account was debited ("84.13"
 * for $100.00 charged as ₹8,413.00), with 2 decimals, or 4 when it is below 1. Null when either amount is missing.
 */
export function rateOf(
  amount: { minor: number; decimals: number },
  charged: { minor: number; decimals: number },
): string | null {
  if (amount.minor <= 0 || charged.minor <= 0) return null
  const rate = charged.minor / 10 ** charged.decimals / (amount.minor / 10 ** amount.decimals)
  return rate.toFixed(rate < 1 ? 4 : 2)
}
