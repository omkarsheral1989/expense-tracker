# Expense Tracker

Client-only, installable PWA for personal and shared (group) expenses. All data is stored on the device. Group data is shared through Google Drive. No backend.

Details: @docs/PRD.md (features, pages, open questions) and @docs/ADR.md (architecture decisions and why).

## Stack
- React 19 + TypeScript + Vite, React Compiler enabled
- Ant Design 6 (`antd`, `@ant-design/icons`), `react-router`
- PGlite (Postgres in the browser, IndexedDB storage) + Drizzle ORM, `drizzle-kit` for migrations
- `idb` for the receipt photo store (IndexedDB), `zod` for validation, `zustand` for app state
- `@react-oauth/google` for sign-in, Google Drive REST API via `fetch`
- `vite-plugin-pwa`, `vitest` + `@testing-library/react`, `papaparse`
- Package manager: `bun`

## Commands
- `bun run dev` start the dev server
- `bun run build` type-check and build
- `bun run lint` lint
- `bunx vitest` run tests

## Rules
- **UI:** Ant Design components only. No Tailwind, no SCSS. Use `ConfigProvider` tokens for theming; plain CSS or CSS modules for small custom styles.
- **Money:** integer minor units, always with a currency code. Respect each currency's decimal places. Multi-currency has no conversion; balances are per currency.
- **IDs:** UUID primary keys, never auto-increment.
- **Rows:** every synced row has `updated_at` and `updated_by`. Delete by setting `deleted_at` (soft delete), never hard delete synced rows.
- **Database:** create and access PGlite only through `getDb()` (single module). Never put photos or large blobs in PGlite.
- **Photos:** access only through the `PhotoStore` interface (`savePhoto`, `getPhoto`, `deletePhoto`), backed by IndexedDB.
- **Sync:** one JSON file per member per group in the group's Drive folder; each file has a single writer. Merge by newest `updated_at` per row (user id as tie-breaker), keep edit history. Validate all downloaded JSON with zod; treat it as untrusted.
- **Storage:** one database per signed-in Google account on a device. Only one tab may open the database.
- **Offline:** the app must render and work offline. Network failures (sign-in, Drive, sync) must degrade gracefully.
- **Secrets:** never commit `.env*` files or tokens. The Google client ID goes in `VITE_GOOGLE_CLIENT_ID`.
- **Tests:** split calculations, balance maths and the sync merge must have unit tests.

## Working agreement
- Do not implement features until the user says where to start. Work on one feature at a time.
- Ask before big or irreversible changes (deleting data, changing the schema shape, swapping a library).
- When a decision changes, update `docs/ADR.md` (and `docs/PRD.md` if behaviour changes) in the same change.
- Only commit when asked.
