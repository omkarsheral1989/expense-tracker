import {
  EMAIL_PATTERN,
  MAX_FIELD_LENGTH,
  PERSONAL_TEXT_FIELD_PATTERN,
  SECRET_FIELD_PATTERN,
  TOKEN_PATTERN,
} from './constants.ts'
import type { LogEntry, LogFields } from './types.ts'

/** Cuts text to the longest a field may be and hides emails and tokens inside it. */
export function cleanText(text: string): string {
  const hidden = text.replace(EMAIL_PATTERN, '[email]').replace(TOKEN_PATTERN, '[token]')
  return hidden.length > MAX_FIELD_LENGTH ? `${hidden.slice(0, MAX_FIELD_LENGTH)}…` : hidden
}

/**
 * Keeps only what is safe to print: plain values, leaving out text under names
 * that may hold personal data and anything under names that may hold money or secrets. Objects are reduced to their type, so nothing nested leaks.
 */
export function cleanFields(fields: LogFields | undefined): LogEntry['fields'] {
  const clean: LogEntry['fields'] = {}
  if (!fields) return clean

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (SECRET_FIELD_PATTERN.test(key)) continue
    if (typeof value === 'string' && PERSONAL_TEXT_FIELD_PATTERN.test(key)) continue
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      clean[key] = value
    } else if (typeof value === 'string') {
      clean[key] = cleanText(value)
    } else if (Array.isArray(value)) {
      clean[key] = `array(${value.length})`
    } else {
      clean[key] = typeof value
    }
  }
  return clean
}

/** The fields that describe a failure: its kind, message and (Drive) status. */
export function errorFields(error: unknown): LogFields {
  if (error instanceof Error) {
    const status = (error as { status?: unknown }).status
    return {
      error: error.name,
      reason: error.message,
      ...(typeof status === 'number' ? { status } : {}),
    }
  }
  return { error: typeof error, reason: String(error) }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The id arguments of a call, under the names given (the first argument, `db`, is skipped). */
export function idFields(args: unknown[], params: string[] = []): LogFields {
  const fields: LogFields = {}
  params.forEach((name, index) => {
    const value = args[index + 1]
    if (typeof value === 'string' && UUID.test(value)) fields[name] = value
  })
  return fields
}

/**
 * What a service function's result says, without its data: whether it worked
 * (`ok`), what refused it (`notFound`, `alreadyCurrent`, ...) and how many
 * fields had errors. Results without an `ok` count as done.
 */
export function outcomeFields(result: unknown): LogFields {
  if (typeof result !== 'object' || result === null) return { ok: true }
  const record = result as Record<string, unknown>
  if (record.ok !== false) return { ok: true }

  const fields: LogFields = { ok: false }
  const refusals = Object.keys(record).filter((key) => key !== 'ok' && record[key] === true)
  if (refusals.length) fields.refusal = refusals.join(',')
  const errors = record.errors
  if (typeof errors === 'object' && errors !== null) fields.fieldErrors = Object.keys(errors).length
  return fields
}
