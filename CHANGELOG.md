# Changelog

## Unreleased (0.2.0)

### Changed
- Removed i18n (English-only UI); language setting dropped from Settings → General
- Backup folder picker uses async dialog plugin (fixes freeze on “Choose folder”)

### Added
- Logical CSS layout properties (`text-start`, `ps-*`, `start-0`) retained from layout pass

## 0.1.0 — 2026-05-23

### Added
- Desktop app (Tauri 2) with SQLite persistence for expenses, categories, budgets, and FX rates
- Trash (soft delete), recurring expense rules, CSV export, multi-currency with local FX rates
- Backup to a configurable folder, list backups from disk, one-click restore
- Settings stored in SQLite on desktop; auto-backup on startup and every 6 hours while the app is open
- Sample data loader (Settings → About)

### Fixed
- Backup “now” saves only to the chosen folder (no duplicate browser Downloads copy on desktop)
- Export CSV modal dark-theme hover contrast
- Demo data import serde alignment between frontend and Rust
