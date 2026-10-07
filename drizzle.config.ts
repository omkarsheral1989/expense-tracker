import { defineConfig } from 'drizzle-kit'

// Only used to generate SQL migration files (`bunx drizzle-kit generate`).
// The app applies them itself in the browser (src/db/migrate.ts).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
})
