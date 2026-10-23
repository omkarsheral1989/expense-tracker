/** The localStorage key that turns debug lines on (`localStorage.setItem('ownledger-debug', '1')`). */
export const DEBUG_STORAGE_KEY = 'ownledger-debug'

/** The address parameter that turns debug lines on for one visit (`?debug=1`). */
export const DEBUG_QUERY_PARAMETER = 'debug'

/** Prefix of every line, so the console can be filtered by "ownledger". */
export const LOG_PREFIX = 'ownledger'

/** Longest text a log field may carry; longer text is cut. */
export const MAX_FIELD_LENGTH = 200

/**
 * Field names whose text may be personal (names, emails, free text, addresses,
 * pictures). Their text is never logged; a count or a flag under the same name
 * (`pictures: 2`) is fine (PRD 5.12).
 */
export const PERSONAL_TEXT_FIELD_PATTERN =
  /email|name|note|description|picture|text|title|url|address|phone|label/i

/** Field names whose value is never logged, whatever its type: money and secrets. */
export const SECRET_FIELD_PATTERN = /amount|cost|price|token|password|secret/i

/** Text inside a value that looks like an email address or a Google token. */
export const EMAIL_PATTERN = /[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[^\s@"'<>(),;:]+/g
export const TOKEN_PATTERN = /\b(?:ya29\.[\w-]+|Bearer\s+[\w.-]+)/g
