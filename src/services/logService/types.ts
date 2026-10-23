export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** What a log line may carry: plain values only, never objects or personal data. */
export type LogFields = Record<string, unknown>

/** One log line as it reaches the output. */
export type LogEntry = {
  level: LogLevel
  scope: string
  message: string
  fields: Record<string, string | number | boolean | null>
}

/** The logger of one part of the app, made by `logService.scope`. */
export type Logger = {
  /** Detail for debugging; shown only when the debug flag is on. */
  debug: (message: string, fields?: LogFields) => void
  /** Something that happened in the normal course of things. */
  info: (message: string, fields?: LogFields) => void
  /** Something went wrong but the app carried on. */
  warn: (message: string, fields?: LogFields) => void
  /** Something failed. */
  error: (message: string, fields?: LogFields) => void
}

/** How `logService.logActions` logs one function of a service. */
export type ActionLog = {
  /** The line written when the function is done, such as "Expense created". */
  message: string
  /** Names for the id arguments after `db` (`['userId', 'groupId']`); only ids are logged. */
  params?: string[]
}
