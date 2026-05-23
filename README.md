# Expense Tracker

A fast, privacy-focused, local-first expense tracking desktop application.
Built with Tauri, React, TypeScript, Rust, and SQLite.

See [expense_tracker_spec_roadmap.md](expense_tracker_spec_roadmap.md) for the full specification.

## Tech stack

- **Tauri 2** — desktop application shell
- **React + TypeScript + Vite** — frontend
- **Tailwind CSS** — styling
- **Zustand** — in-memory UI state (synced to SQLite in the desktop app)
- **Rust + rusqlite** — local SQLite persistence via Tauri commands
- **Recharts** — dashboard and reports charts

## Project layout

```text
src/         React frontend (pages, components, lib, store, types, locales)
src-tauri/   Rust backend (commands, db, migrations)
```

## Development

### Web UI only (localStorage)

```bash
npm install
npm run dev
```

Opens the Vite dev server at `http://localhost:1420`. Data is stored in the browser via Zustand persist (legacy mode).

### Desktop app (SQLite)

Install Linux system dependencies (Debian/Ubuntu example):

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf pkg-config
```

Then:

```bash
npm install
npm run tauri dev
```

On first launch, the app:

1. Creates `expense_tracker.db` under the app data directory
2. Runs SQL migrations from `src-tauri/migrations/`
3. Imports existing browser `localStorage` data once (if present), then clears those keys
4. Otherwise seeds sample categories and expenses

## Build

```bash
npm run build          # frontend only
npm run tauri build    # desktop installer (requires system deps above)
```

## Data model

- **Expenses**, **categories**, **budgets**, and **FX rates** live in SQLite when using Tauri
- **Soft delete** sets `deleted_at`; use the **Trash** screen to restore or permanently delete
- **Settings** (theme, language, backup preferences) remain in local storage for now
- **Manual backup** downloads JSON; in the desktop app, **Backup now** also writes to your configured backup folder when encryption is off
- **Automatic backups** run on app start when enabled (daily / weekly / monthly)
- **Recurring rules** (Settings → Recurring) materialize due expenses into SQLite

## Status

Phase 1 MVP persistence is implemented: SQLite-backed CRUD, trash/restore, localStorage migration, scheduled file backups, and recurring rule materialization in the Tauri build.
