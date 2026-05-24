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

Install Linux system dependencies (Debian/Ubuntu). Required for `npm run tauri dev` — without them Cargo fails with `glib-2.0` / `gobject-2.0` not found:

```bash
bash scripts/install-tauri-linux-deps.sh
```

Or manually:

```bash
sudo apt update
sudo apt install -y build-essential pkg-config libssl-dev libglib2.0-dev \
  libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf
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

Installers are written to:

```text
src-tauri/target/release/bundle/deb/*.deb
src-tauri/target/release/bundle/appimage/*.AppImage
```

### Releasing

1. Install system dependencies (see above).
2. Bump version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` if needed.
3. Run `npm run tauri build`.
4. Tag and publish (example):

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions ([`.github/workflows/release.yml`](.github/workflows/release.yml)) builds Linux bundles on tag push and publishes a GitHub Release with `.deb` and `.AppImage` assets attached.

See [docs/RELEASE.md](docs/RELEASE.md) for manual release steps and [CHANGELOG.md](CHANGELOG.md).

### App data locations

| Platform | Path |
|----------|------|
| Linux | `~/.local/share/com.expensetracker.app/expense_tracker.db` |
| Backups | Folder set in Settings → Backup (default `~/Documents/ExpenseTracker/Backups`) |

## Data model

- **Expenses**, **categories**, **budgets**, and **FX rates** live in SQLite when using Tauri
- **Soft delete** sets `deleted_at`; use the **Trash** screen to restore or permanently delete
- **Settings** (theme, language, backup path, etc.) are stored in SQLite on desktop (`app_settings` table)
- **Backup now** (desktop) writes JSON to your configured folder only — use **Choose folder** to pick the path
- **Backups on disk** lists real files from that folder; **Restore** loads a selected backup
- **Automatic backups** run on app start and every 6 hours while the app is open (skipped when encryption is enabled)
- **Recurring rules** (Settings → Recurring) materialize due expenses into SQLite

## Status

v0.1.0 — Desktop MVP: SQLite persistence, trash/restore, backups, recurring rules, CSV export, multi-currency. Web-only `npm run dev` remains supported for UI work (localStorage).
