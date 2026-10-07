# OwnLedger

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
- `bun run test` run tests (Vitest)
- `bun run preview` serve the production build (the service worker only runs there)

## Rules
- **Folder structure:** each page is `src/pages/<name>/index.tsx` (the entry point, a named export such as `WelcomePage`). Its components live in `src/pages/<name>/components/<Component>/index.tsx`, one folder per component, nested by use: a component used only by one parent sits inside that parent's folder (`components/Hero/SignInButton/index.tsx`). Anything shared by several components lives at their lowest common parent (`components/Section`). A component's own files sit beside its `index.tsx`: copy and data in `content.ts(x)` (`Faq/content.tsx`), styling constants such as colors in `style.ts` (`InstallCard/style.ts`). Constants used by several components sit beside the page entry (`constants.ts`). Import a component folder without a file name (`'../Section'`).
  Shared code stays outside pages, one folder per item, each with an `index.ts(x)` entry:
  - Common components: `src/components/<Component>/index.tsx` (`RequireAuth`).
  - Common zustand stores: `src/stores/<useXStore>/index.ts` (`useAuthStore`).
  - Common hooks: `src/hooks/<useX>/index.ts` (`useSignIn`).
  - API wrappers: `src/services/<xService>/index.ts`, exporting one object (`googleProfileService`).
  - Database code: `src/db` (schema, migrations, client, session and tab lock, with `constants.ts` and `types.ts` beside them; tests in `src/db/__tests__`). The hook that opens it is `src/hooks/useDatabaseSession`.
  - Other shared code: `src/pwa` (platform detection), `src/theme` (the `radius.ts` constants).
  - App-level files stay in `src`: `main.tsx`, `App.tsx`, `config.ts`, `env.d.ts`, `index.css`.
  - Every component and hook is its own folder, even the small ones (`components/GoogleLogo`, `components/ThemeProvider`, `components/PwaUpdatePrompt`, `hooks/useInstall`).
  An item's own files sit beside its `index.ts`: types in `types.ts`, constants in `constants.ts`, zod schemas in `schemas.ts`. Tests go in a `__tests__` folder beside the code they test (`useSyncSessionAcrossTabs/__tests__/index.test.ts`). Code used by only one page stays in that page's folder. Do not create new top-level folders such as `src/auth`.
- **UI:** Ant Design components only. No Tailwind, no SCSS. Use `ConfigProvider` tokens for theming; plain CSS or CSS modules for small custom styles.
- **Corner radius:** only two values, from `src/theme/radius.ts`: `RADIUS.inner` (12) for small things inside others (buttons, inputs, icon tiles) and `RADIUS.outer` (24) for containers (cards, panels). Never hard-code another radius, and don't use `shape="round"` buttons.
- **Money:** integer minor units, always with a currency code. Respect each currency's decimal places. Multi-currency has no conversion; balances are per currency.
- **IDs:** UUID primary keys, never auto-increment.
- **Rows:** every synced row has `updated_at` and `updated_by`. Delete by setting `deleted_at` (soft delete), never hard delete synced rows.
- **Database:** create and access PGlite only through `getDb()` (single module). Never put photos or large blobs in PGlite.
- **Photos:** access only through the `PhotoStore` interface (`savePhoto`, `getPhoto`, `deletePhoto`), backed by IndexedDB.
- **Sync:** one JSON file per member per group in the group's Drive folder; each file has a single writer. Merge by newest `updated_at` per row (user id as tie-breaker), keep edit history. Validate all downloaded JSON with zod; treat it as untrusted.
- **Storage:** one database per signed-in Google account on a device. Only one tab may open the database.
- **Offline:** the app must render and work offline. Network failures (sign-in, Drive, sync) must degrade gracefully.
- **Privacy promises:** the welcome page promises no backend, no ads and no tracking. Never add analytics, tracking or a server that stores user data without updating the welcome page and `docs/ADR.md` first.
- **Secrets:** never commit `.env*` files or tokens. The Google client ID goes in `VITE_GOOGLE_CLIENT_ID`.
- **Tests:** split calculations, balance maths and the sync merge must have unit tests. Test files live in a `__tests__` folder beside the code they test.

## Component code style
- **Keep `return` short.** When a component's `return` grows past roughly 10–20 lines, move parts into `render<Section>()` functions (`renderHeading()`, `renderIosInstructions()`) defined inside the component, above the `return`. Prefer a plain `if` inside a render function over nested ternaries. Example: `pages/welcome/components/InstallCard/index.tsx`.
- **Render one list item with a function.** When mapping a list, write `render<Item>(item: Type)` and use `LIST.map(renderItem)`. Export the item type from the content file (`Feature`, `PrivacyPoint`, `Highlight`). Pass values the function needs as parameters (`renderAvatar(profile)`) when TypeScript would lose a narrowing check inside a nested function.
- **Inline one-off styles.** Write a small style object directly on the element (`style={{ … }}`). Don't create a `wrapperStyle` or `cardStyle` variable for something used once.
- **No dead code.** Remove props and branches that no caller uses (the old `embedded` prop on `InstallCard` was removed once only one layout remained).
- **Move data out of the component.** Copy, step lists and other data go in `content.ts(x)`; colors and similar constants go in `style.ts`.
- **Type constants explicitly and reuse shared types.** For example `WARNING_ICON_COLOR: Record<ColorScheme, string>`, where `ColorScheme` is exported from `src/hooks/useColorScheme`, so a missing key or a typo is a compile error.
- **Document non-obvious props.** Add a `/** … */` comment that says what the prop means, what changes when it is true and when it is false, and where its value comes from (`gated` and `canPrompt` on `InstallCard`).
- **Descriptive names.** Name constants for what they hold (`WARNING_ICON_COLOR`, not `WARNING_ICON`).
- **Spelling:** use "color" (not "colour") everywhere: identifiers, comments, docs and copy.

## Working agreement
- Do not implement features until the user says where to start. Work on one feature at a time.
- Ask lots of clarifying questions before implementing any code. Settle requirements, edge cases and copy first, record decisions in `docs/PRD.md` and `docs/ADR.md`, and start coding only when the user says so.
- Ask before big or irreversible changes (deleting data, changing the schema shape, swapping a library).
- When a decision changes, update `docs/ADR.md` (and `docs/PRD.md` if behaviour changes) in the same change.
- Only commit when asked. Before every commit read `git status` and stage files by name; never use a blind `git add -A`. Files such as `google-settings.json` (a Google OAuth download with a client secret) and `.env*` must never be staged.
- Run shell commands from the project root (give the full path with `cd`), because the working directory persists between commands.
- After a UI change, check it in the browser pane (dev server, `?platform=ios|android|desktop` and `?installed=1` simulate the install cases), and run `bunx tsc -b`, `bun run lint` and `bun run test` before saying it is done.
