import { sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

/**
 * The name this device shows for a person: the local name when there is one,
 * else the shared name (ADR-045). Every query that selects a person's name for
 * a screen uses it, so a person never has two names on one device.
 */
export function shownName(table: { name: AnyPgColumn; localName: AnyPgColumn }) {
  return sql<string | null>`coalesce(${table.localName}, ${table.name})`
}
