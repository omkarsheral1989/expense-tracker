import type { PGlite } from '@electric-sql/pglite'

/**
 * The SQL files `drizzle-kit generate` writes to `src/db/migrations`, keyed by
 * path, bundled into the app. Drizzle's own migrator reads the file system, so
 * it cannot run in a browser.
 */
const bundledMigrations = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// drizzle-kit separates the statements of a file with this marker.
const STATEMENT_BREAKPOINT = '--> statement-breakpoint'

/**
 * Applies every migration that has not run yet, oldest first (file names start
 * with a number, so sorting them gives the order). Each file runs in its own
 * transaction, together with the row that records it, so a failed file leaves
 * nothing half-applied. Safe to call on every start.
 */
export async function runMigrations(
  pg: PGlite,
  migrations: Record<string, string> = bundledMigrations,
) {
  await pg.exec(`
    create table if not exists ownledger_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `)

  const { rows } = await pg.query<{ name: string }>(
    'select name from ownledger_migrations',
  )
  const applied = new Set(rows.map((row) => row.name))

  for (const path of Object.keys(migrations).sort()) {
    const name = path.split('/').pop() ?? path
    if (applied.has(name)) continue

    await pg.transaction(async (tx) => {
      for (const statement of migrations[path].split(STATEMENT_BREAKPOINT)) {
        if (statement.trim()) await tx.exec(statement)
      }
      await tx.query('insert into ownledger_migrations (name) values ($1)', [
        name,
      ])
    })
  }
}
