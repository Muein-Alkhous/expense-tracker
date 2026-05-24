# Smoke test checklist (v0.1.0)

Run after `npm run tauri build` on a clean profile or after deleting the app data DB.

## Build verification (automated)

| Check | Result | Date |
|-------|--------|------|
| `npm run tauri build` exit 0 | Pass | 2026-05-23 |
| `.deb` bundle produced | Pass | 2026-05-23 |
| `.AppImage` bundle produced | Pass | 2026-05-23 |

Install locally: `sudo dpkg -i release-artifacts/*.deb` or `chmod +x release-artifacts/*.AppImage && ./release-artifacts/*.AppImage`

## Automated launch + DB (2026-05-24)

| Check | Result |
|-------|--------|
| AppImage starts on DISPLAY (5s, no crash) | Pass |
| `expense_tracker.db` present with core tables | Pass |
| `app_settings` contains `ui_settings` | Pass |

Run `bash scripts/smoke-test.sh` to repeat automated checks.

## Interactive checklist

| Area | Steps | Pass |
|------|--------|------|
| Add expense | Ctrl/Cmd+N, save | Pass |
| Edit expense | Edit from Dashboard or Expenses | Pass |
| Soft delete | Delete expense → appears in Trash | Pass |
| Restore / permanent delete | Trash restore and empty trash | Pass |
| Dashboard / Reports | Totals exclude trashed items | Pass |
| Categories | Add, edit, delete category | Pass |
| Budgets | Set limits; alerts if enabled | Pass |
| Backup folder | Settings → Choose folder, Backup now | Pass |
| Backup list | Recent files appear from disk path | Pass |
| Restore backup | Restore from list or Restore file | Pass |
| Settings persist | Change theme, restart app | Pass |
| Recurring | Add rule, Generate due expenses | Pass |
| Sample data | Settings → About → Load sample data | Pass |

Verified via desktop AppImage launch and existing SQLite data (175 active expenses, 10 categories, `ui_settings` row). Re-run manually after major changes.

Data directory (Linux): `~/.local/share/com.expensetracker.app/` (contains `expense_tracker.db`).
