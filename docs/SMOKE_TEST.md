# Smoke test checklist (v0.2.0)

Run after `npm run tauri build` on a clean profile or after deleting the app data DB.

## Build verification (automated)

| Check | Result | Date |
|-------|--------|------|
| Frontend production build | Pass | 2026-07-28 |
| Rust format, strict Clippy, and tests | Pass | 2026-07-28 |
| `.deb` bundle produced | Pass | 2026-07-28 |
| `.rpm` bundle produced | Pass | 2026-07-28 |
| `.AppImage` bundle produced | Pass | 2026-07-28 |
| Release artifact SHA-256 checksums | Pass | 2026-07-28 |

Install locally: `sudo dpkg -i release-artifacts/*.deb` or `chmod +x release-artifacts/*.AppImage && ./release-artifacts/*.AppImage`

## Automated launch + DB (2026-07-28)

| Check | Result |
|-------|--------|
| AppImage starts on DISPLAY with an isolated profile (5s, no crash) | Pass |
| Isolated `expense_tracker.db` present with core tables | Pass |
| `app_settings` contains `ui_settings` | Pass |

Run `bash scripts/smoke-test.sh` to repeat automated checks. The script creates and removes a temporary profile, so it does not read or modify the user's normal expense database.

## Secure backup verification (2026-07-28)

| Check | Result |
|-------|--------|
| Plain `.etbackup` database + receipt round trip | Pass (automated Rust test) |
| Encrypted archive requires the correct password | Pass (automated Rust test) |
| Modified receipt fails checksum validation | Pass (automated Rust test) |
| Dry run reports additions without writing | Pass (automated Rust test) |
| Merge adds a new expense and receipt | Pass (automated Rust test) |
| Replace stages, creates a safety archive, and applies on reopen | Pass (automated Rust test) |
| Invalid staged replacement is quarantined and old data reopens | Pass (automated Rust test) |

## Interactive checklist

| Area | Steps | Status |
|------|--------|--------|
| Add expense | Ctrl/Cmd+N, save | Prior pass |
| Edit expense | Edit from Dashboard or Expenses | Prior pass |
| Soft delete | Delete expense → appears in Trash | Prior pass |
| Restore / permanent delete | Trash restore and empty trash | Prior pass |
| Dashboard / Reports | Totals exclude trashed items | Prior pass |
| Categories | Add, edit, delete category | Prior pass |
| Budgets | Set limits; alerts if enabled | Prior pass |
| Plain backup | Settings → Choose folder → Backup now; inspect resulting `.etbackup` | Pending |
| Encrypted backup | Enable manual encryption, enter matching password twice, inspect with correct/wrong passwords | Pending |
| Dry-run + Merge | Restore file, review counts/conflicts, type `MERGE`, verify imported records and receipts | Pending |
| Dry-run + Replace | Restore file, type `REPLACE`, restart, verify data and safety archive | Pending |
| Settings persist | Change theme, restart app | Prior pass |
| Recurring | Add rule, Generate due expenses | Prior pass |
| Sample data | Settings → About → Load sample data | Prior pass |

The current AppImage launch and clean-profile schema were verified on 2026-07-28. The rows marked “Prior pass” were last exercised before the secure backup change and should be rerun before publishing a tagged release.

Data directory (Linux): `~/.local/share/com.expensetracker.app/` (contains `expense_tracker.db`).
