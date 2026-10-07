# Architecture Decision Records

_Last updated: 2026-10-07_. Each entry: context, decision, alternatives rejected, consequences. Update an entry (or add a new one) whenever a decision changes.

## ADR-001: React + Vite, client-only (no Next.js)
- **Context:** The app stores everything locally and has no server work to do.
- **Decision:** Plain React 19 with TypeScript, built with Vite.
- **Rejected:** Next.js, because SSR and server features are unused.
- **Consequences:** Static hosting over HTTPS is enough. No backend to maintain.

## ADR-002: PGlite for the local database
- **Context:** The app needs joins, foreign keys and thousands of rows, locally in the browser.
- **Decision:** PGlite (Postgres compiled to WASM).
- **Rejected:** SQLite WASM (also viable; lighter, more mature, single-file backups), sql.js, Dexie/IndexedDB (not SQL).
- **Consequences:** Real date types and `NUMERIC`, and a path to a Postgres backend later. Larger bundle and a younger project that may have breaking changes between versions.

## ADR-003: IndexedDB storage for PGlite (`idb://`)
- **Context:** The OPFS backend is faster but fails on Safari (limit of 252 open handles). The app must work on iOS.
- **Decision:** Use `idb://`. Create the database only through `getDb()` so the backend can change later.
- **Rejected:** `opfs-ahp://` (no Safari), `memory://` (no persistence).
- **Consequences:** PGlite loads the whole database into memory, so memory grows with data size (fine for tens of thousands of rows). Only one tab may open the database. A move to OPFS later needs a worker and a dump/restore migration.

## ADR-004: Drizzle ORM
- **Decision:** Drizzle with `drizzle-orm/pglite`; `drizzle-kit` generates SQL migrations, which are bundled and run at startup in the browser.
- **Rejected:** Kysely, Prisma and classic ORMs (poor browser or PGlite fit), raw SQL (no type safety).
- **Consequences:** Typed schema and queries; browser migration runner must be written by us.

## ADR-005: Ant Design only for UI
- **Decision:** Ant Design 6 and `@ant-design/icons` for all UI. Theme via `ConfigProvider` tokens. Plain CSS or CSS modules for small custom styles.
- **Rejected:** Tailwind (style clashes with Ant Design's reset, two styling systems), SCSS (not needed).
- **Consequences:** Charts are outside Ant Design; the library is chosen later.

## ADR-006: Receipt photos in IndexedDB via `idb`
- **Decision:** Photos live in a separate IndexedDB database (blobs, original size) with thumbnails in a separate store. PGlite holds only photo metadata. All access goes through a `PhotoStore` interface.
- **Rejected:** OPFS (no better durability, more browser caveats), storing photos in PGlite (memory use).
- **Consequences:** Photos share the site storage quota. Request persistent storage and monitor usage. Photos are only safe once uploaded to Drive.

## ADR-007: Per-account local databases
- **Decision:** The database and photo store names include the Google account id.
- **Consequences:** Two people sharing a device do not see each other's data.

## ADR-008: Personal backup with `pgDump` to Google Drive
- **Decision:** A button runs `pgDump` (`@electric-sql/pglite-tools`) and uploads the SQL to the user's Drive. `dumpDataDir()` may be offered as a quick snapshot.
- **Consequences:** Portable, restorable into real Postgres. Backup is manual, because browser tokens expire after about an hour and there is no refresh token.

## ADR-009: Group sharing through Google Drive with the full `drive` scope
- **Context:** `drive.file` cannot see files created by other users unless picked through the Google Picker, which does not fit a one-click sync.
- **Decision:** Use the full `drive` scope, with the OAuth app in Testing mode (up to 100 named test users, "unverified app" warning). Each group has a Drive folder shared with members through the Drive permissions API.
- **Rejected:** `drive.file` + Picker (extra picking steps), a real backend such as Firebase or Supabase (not client-only).
- **Consequences:** Not publishable publicly without Google's security assessment. Fine for personal and small-circle use. The folder owner (the creator) holds the folder.

## ADR-010: One JSON file per member per group
- **Decision:** Each member writes only their own file (for example `group1/user1.json`) holding the row versions they wrote, including edits to other members' expenses. Sync reads all other members' files, merges, then uploads their own.
- **Merge:** newest `updated_at` wins per row, user id as tie-breaker; edit history is kept; deletes are soft. UUID keys avoid collisions.
- **Consequences:** No upload conflicts. If two members edit the same expense between syncs, the later edit wins (the older one stays in history). It relies on reasonably accurate device clocks. Synced JSON is untrusted, so validate with zod.

## ADR-011: Any group member can edit group data and expenses
- **Decision:** Any member can edit or delete any group expense and can add members.
- **Consequences:** Needs the merge rules above. Members must be able to share the Drive folder (do not disable "editors can change permissions").

## ADR-012: Multi-currency without conversion
- **Decision:** Amounts are integer minor units with a currency code. Balances are tracked per currency.
- **Consequences:** Home page can show several lines per group. A rounding helper must handle currencies with different decimal places.

## ADR-013: Sync downloads all photos
- **Decision:** Sync downloads all missing photos before finishing and is resumable. Data is merged and committed before photos start.
- **Consequences:** A large first sync can be slow and heavy on storage and mobile data; warn the user first and stop cleanly on quota errors.

## ADR-014: Installable PWA, install gate firm on iOS
- **Decision:** `vite-plugin-pwa` for the manifest and service worker. The welcome page shows install instructions. On iPhone/iPad the login button appears only in the installed app (with a "continue in browser" link); on Android and desktop, installing is optional.
- **Reason:** An installed iOS PWA has its own storage, separate from Safari, so data entered in a tab would not carry over.
- **Consequences:** Google sign-in in a standalone iOS PWA needs early testing on a real iPhone; fallback is a redirect-based flow. Keep the signed-in profile locally so the app opens offline.

## ADR-016: Name, look and visuals
- **Decision:** The app is called **OwnLedger**. Friendly, colourful look with a teal/green accent, applied through Ant Design `ConfigProvider` tokens; follows the system light/dark setting. Visuals come from Ant Design icons, gradients and emoji.
- **Rejected:** Custom SVG illustrations or supplied image assets (more work, no need yet), Ant Design's default blue.
- **Consequences:** No image assets to maintain. Visual polish is limited to what icons, colour and layout can do. The name's trademark and domain availability were not checked.

## ADR-017: Open source under GPL-3.0, public repository
- **Decision:** The code is public at https://github.com/omkarsheral1989/expense-tracker under GPL-3.0 (`license` field is `GPL-3.0-only`). The welcome page says so and links to the repository.
- **Consequences:** Derivative works must also be GPL. The privacy claims on the welcome page are verifiable by reading the code, which also means they must stay true (see ADR-018).

## ADR-018: Welcome page privacy claims are commitments
- **Decision:** The welcome page states: offline first, no OwnLedger servers, no ads and no tracking, user owns the data. These constrain the codebase: no backend storing user data, and no analytics, tracking or ad SDKs. The FAQ states honestly that the Google Drive permission is broad (full `drive` scope) and that the app only uses its own folders.
- **Consequences:** Adding analytics or a backend later requires updating the welcome page and this ADR first. Avoid unqualified claims such as "very secure".

## ADR-019: Google sign-in button and token flow
- **Decision:** A custom Ant Design button with the Google "G" logo, following Google's branding rules for wording and logo, started by `useGoogleLogin` from `@react-oauth/google`, which provides an access token with the Drive scope.
- **Rejected:** Google's official rendered button (`GoogleLogin`), which returns an ID token and fits poorly with the token flow needed for Drive access.
- **Consequences:** The button must be triggered directly by a user click (popup blockers). Tokens last about an hour with no refresh token, so Drive actions may re-prompt. Because the OAuth app stays in Testing mode (ADR-009), users see Google's "hasn't verified this app" screen, and only people added as test users can sign in ("Access blocked" otherwise). The FAQ explains both and points people who are blocked to the GitHub issues page (https://github.com/omkarsheral1989/expense-tracker/issues) to request access.

## ADR-020: Placeholder home route
- **Decision:** Until the home page is built, a successful sign-in routes to `/home`, a simple "Signed in as <name>" page with a sign-out button.
- **Consequences:** Temporary; replace when the real home page is implemented.

## ADR-021: Libraries
- **Runtime:** `@electric-sql/pglite`, `@electric-sql/pglite-react`, `@electric-sql/pglite-tools`, `drizzle-orm`, `@react-oauth/google`, `zod`, `idb`, `papaparse`, `zustand`, plus `antd`, `@ant-design/icons`, `react-router`.
- **Dev:** `drizzle-kit`, `vite-plugin-pwa`, `vitest`, `jsdom`, `@testing-library/react`, `@types/papaparse`.
- **Config still to add:** `optimizeDeps: { exclude: ['@electric-sql/pglite'] }` in `vite.config.ts`, the PWA plugin, a Vitest setup, and `VITE_GOOGLE_CLIENT_ID` in `.env`.
