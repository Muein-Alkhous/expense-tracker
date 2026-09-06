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

### Windows installer

Build the unsigned Windows 10/11 x64 NSIS installer on Windows:

```powershell
npm ci
npm run tauri:build:windows
```

The setup executable is written to:

```text
src-tauri/target/release/bundle/nsis/*-setup.exe
```

The `Windows Installer` GitHub Actions workflow builds the same installer on a
Windows runner and uploads the `.exe` together with its SHA-256 checksum. Since
the installer is not code-signed, Microsoft SmartScreen may show a warning.
The installer uses WebView2's downloaded bootstrapper when WebView2 is missing.

### Android application

The Android build reuses the local SQLite database and the same React/Rust
application logic. On a machine with the Android SDK, NDK, Java 17+, and the
Android Rust targets installed:

```bash
npm ci
npm run tauri:android:init
npm run tauri:android:build
```

The `Android APK` GitHub Actions workflow performs the same initialization and
build on Linux and uploads an installable debug APK with a SHA-256 checksum.
The phone UI uses bottom navigation, touch-sized controls, safe-area spacing,
and responsive versions of every existing screen.

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
git tag v0.2.0
git push origin v0.2.0
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
- **Settings** (theme, currency, backup path, etc.) are stored in SQLite on desktop (`app_settings` table)
- **Backup now** creates a complete `.etbackup` archive containing a consistent SQLite snapshot, receipt images, a versioned manifest, and SHA-256 checksums
- Manual archives can use Argon2id-derived AES-256-GCM encryption; automatic archives are local and unencrypted
- Restore validates paths, checksums, SQLite integrity, schema compatibility, records, and receipts before showing a no-write dry-run report
- **Merge** adds non-conflicting supported records; **Replace** creates a safety archive and stages an atomic restore for the next application start
- Automatic backups run on app start and every 6 hours while the app is open, retaining the newest 10 automatic archives
- **Recurring rules** (Settings → Recurring) materialize due expenses into SQLite

## Status

v0.2.0 development — Desktop MVP with SQLite persistence, normalized trash/restore, receipt attachments, secure `.etbackup` archives, dry-run/merge/staged-replace restore, recurring rules, CSV export, and multi-currency. Web-only `npm run dev` remains supported for UI work (localStorage).
