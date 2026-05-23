# Smoke test checklist (v0.1.0)

Run after `npm run tauri build` on a clean profile or after deleting the app data DB.

## Build verification (automated)

| Check | Result | Date |
|-------|--------|------|
| `npm run tauri build` exit 0 | Pass | 2026-05-23 |
| `.deb` bundle produced | Pass | 2026-05-23 |
| `.AppImage` bundle produced | Pass | 2026-05-23 |

Install locally: `sudo dpkg -i release-artifacts/*.deb` or `chmod +x release-artifacts/*.AppImage && ./release-artifacts/*.AppImage`

## Interactive checklist

| Area | Steps | Pass |
|------|--------|------|
| Add expense | Ctrl/Cmd+N, save | ☐ |
| Edit expense | Edit from Dashboard or Expenses | ☐ |
| Soft delete | Delete expense → appears in Trash | ☐ |
| Restore / permanent delete | Trash restore and empty trash | ☐ |
| Dashboard / Reports | Totals exclude trashed items | ☐ |
| Categories | Add, edit, delete category | ☐ |
| Budgets | Set limits; alerts if enabled | ☐ |
| Backup folder | Settings → Choose folder, Backup now | ☐ |
| Backup list | Recent files appear from disk path | ☐ |
| Restore backup | Restore from list or Restore file | ☐ |
| Settings persist | Change theme/language, restart app | ☐ |
| Recurring | Add rule, Generate due expenses | ☐ |
| Sample data | Settings → About → Load sample data | ☐ |

Data directory (Linux): `~/.local/share/com.expensetracker.app/` (contains `expense_tracker.db`).
