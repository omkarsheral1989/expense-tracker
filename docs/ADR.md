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

## ADR-022: PWA tooling and update behaviour
- **Decision:** `vite-plugin-pwa` (Workbox `generateSW`) precaches the built files and falls back to `index.html`. `registerType: 'prompt'`: a new version is announced with a notification and applied only when the user taps Reload. Icons (64, 192, 512, maskable, Apple touch, favicon) are generated at build time by `@vite-pwa/assets-generator` from `public/logo.svg`, with no extra padding because the source already respects the maskable safe zone.
- **Rejected:** `autoUpdate` (could replace the app while the user is mid-entry); hand-made icon PNGs.
- **Consequences:** The service worker exists only in production builds, so test offline behaviour with `bun run build && bun run preview`. The precache size limit must be raised when the PGlite WASM files are added. Offline caching was not confirmed in the embedded preview browser and should be checked in real Chrome (DevTools, Application, Offline).

## ADR-023: Install detection and iOS gate
- **Decision:** `src/pwa/platform.ts` detects the platform from the user agent (iPadOS reports as a touch-screen Mac) and standalone mode from `display-mode: standalone` or `navigator.standalone`. `src/hooks/useInstall` captures `beforeinstallprompt` at module load, because it can fire before React mounts. Sign-in is gated only on iOS when not installed and not skipped; `VITE_REQUIRE_INSTALL=false` disables the gate. In development, `?platform=` and `?installed=1` simulate each case.
- **Placement:** the install card is rendered inside the hero, above the sign-in button, so installing is the first thing a visitor acts on (it was originally a separate section below the hero). While gated, the card is the call to action and the sign-in button is not rendered.
- **Consequences:** The skip choice is not persisted, so iOS users see the gate on every browser visit. User-agent detection can be wrong for unusual browsers; `detectPlatform` has unit tests. Native install prompts exist only in Chromium browsers; others get written instructions.

## ADR-016: Name, look and visuals
- **Decision:** The app is called **OwnLedger**. Friendly, colorful look with a teal/green accent, applied through Ant Design `ConfigProvider` tokens; follows the system light/dark setting. Visuals come from Ant Design icons, gradients and emoji.
- **Corner radius:** two tiers only, defined in `src/theme/radius.ts`: **inner 12 px** for small things inside other things (buttons, inputs, icon tiles) and **outer 24 px** for containers (cards, panels, collapse, the hero logo tile). They are applied as Ant Design tokens (`borderRadius`, `borderRadiusSM`, `borderRadiusXS` = inner; `borderRadiusLG` = outer). Large buttons and inputs would otherwise inherit the outer radius and look like pills, so `Button`, `Input`, `InputNumber`, `Select` and `DatePicker` override `borderRadiusLG` back to inner. Buttons use the default shape, not `shape="round"`. Circles (avatars) are exempt.
- **Rejected:** Custom SVG illustrations or supplied image assets (more work, no need yet), Ant Design's default blue.
- **Consequences:** No image assets to maintain. Visual polish is limited to what icons, color and layout can do. The name's trademark and domain availability were not checked.

## ADR-017: Open source under GPL-3.0, public repository
- **Decision:** The code is public at https://github.com/omkarsheral1989/expense-tracker under GPL-3.0 (`license` field is `GPL-3.0-only`). The welcome page says so and links to the repository.
- **Consequences:** Derivative works must also be GPL. The privacy claims on the welcome page are verifiable by reading the code, which also means they must stay true (see ADR-018).

## ADR-018: Welcome page privacy claims are commitments
- **Decision:** The welcome page states: offline first, no OwnLedger servers, no ads and no tracking, user owns the data. These constrain the codebase: no backend storing user data, and no analytics, tracking or ad SDKs. The FAQ states honestly that the Google Drive permission is broad (full `drive` scope) and that the app only uses its own folders.
- **Consequences:** Adding analytics or a backend later requires updating the welcome page and this ADR first. Avoid unqualified claims such as "very secure".

## ADR-019: Google sign-in button and token flow
- **Decision:** A custom Ant Design button with the Google "G" logo, following Google's branding rules for wording and logo, started by `useGoogleLogin` (implicit flow) from `@react-oauth/google`. Sign-in asks for **basic scopes only** (`openid email profile`); the Drive scope is requested later, at the first backup or sync (incremental consent, a second prompt). The profile is read from Google's userinfo endpoint and validated with zod.
- **Without a client ID:** `useGoogleLogin` throws while rendering when the client ID is empty, which would blank the page. The provider and Google's script are skipped, and a separate button only explains that sign-in is not configured.
- **Rejected:** Google's official rendered button (`GoogleLogin`), which returns an ID token and fits poorly with the token flow needed for Drive access.
- **Consequences:** The button must be triggered directly by a user click (popup blockers). Tokens last about an hour with no refresh token, so Drive actions may re-prompt. Because the OAuth app stays in Testing mode (ADR-009), users see Google's "hasn't verified this app" screen, and only people added as test users can sign in ("Access blocked" otherwise). The FAQ explains both and points people who are blocked to the GitHub issues page (https://github.com/omkarsheral1989/expense-tracker/issues) to request access.

## ADR-024: Session handling
- **Decision:** The signed-in profile (Google id, email, name, picture) is persisted in `localStorage` (zustand `persist`, key `ownledger-session`) so the app opens offline without a new Google login. The access token is kept in memory only and is requested again when a Drive action needs it (`validToken` treats a token with under a minute left as expired). Signed-in visitors to `/` are redirected to `/home`; signed-out visitors to `/home` go back to `/` (`RequireAuth`).
- **Across tabs:** every open tab follows the stored session. The browser's `storage` event tells the other tabs when one changes it, and the `useSyncSessionAcrossTabs` hook (`src/hooks/useSyncSessionAcrossTabs`, called once in `App`) reloads the profile from storage, or signs the tab out if the session was removed or cleared. So signing out in one tab signs out all of them, and signing in shows up in the others. The in-memory access token is never shared; a tab without one asks for its own when a Drive action needs it. The database tab lock (ADR-026) still lets only one tab open the data.
- **Sign-out:** clears the session and token only. The account's local database and photos stay on the device, and signing back in restores them. Google's access is not revoked.
- **Consequences:** "Signed in" means "this device remembers who you are"; it is not proof of a current Google session. Anyone with access to the browser profile can open the app, so a future app lock may be wanted (see PRD open questions).

## ADR-020: Placeholder home route
- **Decision:** Until the home page is built, a successful sign-in routes to `/home`, a simple "Signed in as <name>" page with a sign-out button.
- **Consequences:** Temporary; replace when the real home page is implemented.

## ADR-025: Data model for people and groups
- **Decision:** three tables. `people` holds one row per person, identified by lower-cased email (unique), with an optional name; the signed-in user is a person too. `groups` has a name (1 to 60 characters), a type (`trip`, `home`, `couple`, `other`, enforced by a check constraint), a required `default_currency` (a three-letter upper-case ISO 4217 code, checked by a constraint; added in the second migration) and `created_by`. `group_members` links a person to a group (unique per pair). Every table has a UUID primary key, `updated_at`, `updated_by` (a person) and `deleted_at`, as the sync design requires. "Pick an existing member" reads from `people`.
- **Default currency:** the group's currency only pre-fills new expenses. It does not stop an expense from using another currency, and nothing is converted (ADR-012). The picker offers all ISO currencies (from the browser's `Intl` data) and preselects the one for the device's region.
- **Rejected:** keeping members as an email list inside each group (no shared list of known people, and no clean per-member rows for splits and balances later).
- **Consequences:** `updated_at` is set by the application on every change; there is no database trigger. Group members must be `@gmail.com` addresses (a product rule, checked in the app, not the database), so Google Workspace users with other domains are excluded for now.

## ADR-026: Opening the database, migrations and tab lock
- **Decision:** the database is opened for one account at a time as `idb://ownledger-<google account id>` through `src/db/client.ts` (`openDatabase`, `getDb`, `closeDatabase`). Migrations are SQL files generated by `drizzle-kit` (`src/db/migrations`), bundled with `import.meta.glob` and applied at open time by our own small runner (`src/db/migrate.ts`), which records applied files in an `ownledger_migrations` table and runs each file in a transaction. Drizzle's own migrator reads the file system, so it cannot run in a browser. A Web Lock keeps a second tab from opening the same database and shows a clear message instead. Vite excludes `@electric-sql/pglite` from dependency pre-bundling, and the service worker's precache limit is raised to hold PGlite's WASM and data files.
- **Tests:** database code is tested with Vitest against in-memory PGlite, running the same migrations.
- **Consequences:** the first load downloads and caches several megabytes of WASM. Only one tab can use the app at a time.

## ADR-027: Form validation
- **Decision:** forms use Ant Design `Form` for the screen and zod for the rules. The rules of a form are written once, as a zod schema (for create-group: name 1 to 60 characters, `@gmail.com` member emails lower-cased and unique, a valid ISO currency, one of the four types). The Ant Design form has no field rules of its own: on submit it passes its values to the save function, which validates them with the schema and returns one message per field, and the form shows them with `form.setFields`. Format problems and functional ones (such as a taken name) therefore come back the same way, and the rules exist in one place with no adapter. A message is cleared when its field is edited. Checks run only when the user presses the submit button, as chosen for create-group. The database constraints remain the last safety net.
- **Functional checks** (those that depend on existing data, such as "a group with this name already exists") run inside the save function, in the same transaction as the insert. They return field errors, which the form places beside the right field, rather than throwing. Unexpected failures (the database not open, a query error) throw and show a general error message.
- **Limits:** a duplicate group name can only be detected on this device. Groups created by other members on other devices meet only at sync time, so such checks are a convenience, not a guarantee.
- **Leaving a form with unsaved input:** the page's own Back and Cancel buttons ask for confirmation, and a `beforeunload` handler covers reload and closing the tab. The browser's Back button is not intercepted, because `useBlocker` only works with React Router's data router (`createBrowserRouter`) and the app uses `BrowserRouter`. Switching routers is a possible later change.
- **Rejected:** react-hook-form or Formik (duplicate what Ant Design `Form` does), and keeping the rules only inside the form (they could not be reused by the save function or tested on their own).

## ADR-028: Signed-in layout and the group list
- **Decision:** signed-in pages share one layout with a header (the OwnLedger name and an avatar menu with the user's name, email and Sign out), placed in the existing protected layout route so every future page gets it. Groups are listed by `updated_at` of the group, newest first; "recent activity" will later also count the latest expense change, and the list query is the one place to extend. A user's groups are those where they have a live (not deleted) membership, in a live group. A group page for an id the user does not belong to shows "Group not found", the same as for an unknown id, so the page does not reveal whether a group exists.
- **Loading data:** the home page and the group page read the database once when they open, through a small hook that exposes loading, error and retry states, rather than live queries. Live queries (the installed `@electric-sql/pglite-react`) would need PGlite opened with its live extension; they can be introduced later if a page must update while it is open, for example when sync brings in a new group.
- **Balances:** each row ends with the user's balance in the group. There are no expenses yet, so every group reads "Settled up"; the balance line is a separate piece so real amounts replace it without changing the list.
- **Consequences:** `updated_at` must be set whenever a group or its members change, since it drives the order.

## ADR-029: Testing functional requirements
- **Decision:** each functional requirement in the PRD is covered by an automated test at the lowest level that can show it: pure rules as unit tests; data functions against in-memory PGlite with the real migrations; pages and forms as component tests that use `@testing-library/user-event` to type and click and `@testing-library/jest-dom` to check what is on screen. Component tests run in jsdom with a real in-memory database behind `getDb()`, not mocked queries, so a test fails if the page, the service or the schema disagree. A shared setup file adds the browser features jsdom lacks and Ant Design needs (such as `matchMedia` and `ResizeObserver`).
- **Scope so far:** the create-group page and the C3 pages (header, home, group page). The welcome page keeps its current tests; extending component tests to it is possible later.
- **Limits:** jsdom has no layout, so responsive behavior and visual details (colors, spacing, phone layout) are still checked by hand in the browser. Real IndexedDB storage and the browser-only tab lock are not exercised by these tests either.
- **Libraries (dev):** `@testing-library/user-event`, `@testing-library/jest-dom`, alongside `@testing-library/react` and `jsdom`.

## ADR-021: Libraries
- **Runtime (added later):** `country-to-currency` (MIT, 16 KB, no dependencies) maps a device's region to its currency, to preselect the default currency in create-group. The browser can list currencies but cannot say which one a region uses. Region comes from the browser's locale.
- **Runtime:** `@electric-sql/pglite`, `@electric-sql/pglite-react`, `@electric-sql/pglite-tools`, `drizzle-orm`, `@react-oauth/google`, `zod`, `idb`, `papaparse`, `zustand`, plus `antd`, `@ant-design/icons`, `react-router`.
- **Dev:** `drizzle-kit`, `vite-plugin-pwa`, `vitest`, `jsdom`, `@testing-library/react`, `@types/papaparse`.
- **Config still to add:** `optimizeDeps: { exclude: ['@electric-sql/pglite'] }` in `vite.config.ts`, the PWA plugin, a Vitest setup, and `VITE_GOOGLE_CLIENT_ID` in `.env`.
