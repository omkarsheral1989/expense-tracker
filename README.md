# OwnLedger

Client-only, installable PWA for personal and shared (group) expenses. All data is stored on the device; groups are shared through Google Drive. There is no backend, no ads and no tracking. Free and open source (GPL-3.0). Live at https://omkarsheral1989.github.io/ownledger/.

- What it does and how each page behaves: [docs/PRD.md](docs/PRD.md)
- Why it is built this way: [docs/ADR.md](docs/ADR.md)
- Working notes for contributors and Claude Code: [CLAUDE.md](CLAUDE.md)
- Manual check of backup and sync on real Google Drive: [docs/DRIVE_TEST.md](docs/DRIVE_TEST.md)

## Stack

- React 19 + TypeScript + Vite, React Compiler enabled
- Ant Design 6 for the UI, `react-router`, `react-day-picker` for the date calendar
- **Recharts** for charts (the group Totals page, ADR-064)
- PGlite (Postgres in the browser, IndexedDB storage) + Drizzle ORM, `drizzle-kit` for migrations
- `idb` for receipt photos, `zod` for validation, `zustand` and TanStack Query for app state
- `@react-oauth/google` for sign-in and the Google Drive REST API for backup and sharing
- `vite-plugin-pwa`, `vitest` + Testing Library, `papaparse`
- Package manager: `bun`

## Commands

```bash
bun run dev            # dev server at http://localhost:5173/ownledger/
bun run build          # type-check and build
bun run lint           # lint
bun run test           # run the tests (about 30 s)
bun run preview        # serve the production build at http://localhost:4173/ownledger/ (the service worker only runs there)
bun run deploy:pages   # build and copy into the omkarsheral1989.github.io repository (never commits or pushes)
```

Google sign-in needs `VITE_GOOGLE_CLIENT_ID` in `.env.local` (never committed; see `.env.example`).
