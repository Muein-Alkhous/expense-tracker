# Expense Tracker — Project Status and Structure Review

**Review date:** 2026-07-27  
**Reviewed branch:** `main` at `d5bd068`  
**Specification:** [`expense_tracker_spec_roadmap.md`](../expense_tracker_spec_roadmap.md)

## Executive summary

Expense Tracker is a functional desktop MVP, not a prototype. It already supports the main daily workflow, uses SQLite in the Tauri application, and has packaged Linux release artifacts for v0.1.0.

The project is currently best described as:

- **Desktop maturity:** late MVP / early beta
- **Roadmap position:** Phases 0–2 are largely complete; Phases 3–4 are partially complete
- **Mobile maturity:** architectural groundwork only; the mobile product work in Phase 5 has not started
- **Most important next step:** stabilize data safety and persistence, then build a responsive mobile shell before generating Android/iOS projects

The strongest parts are expense tracking, dashboards, reports, budgets, local persistence, multi-currency conversion, and rule-based insights. The largest gaps are the specified backup security/integrity model, automated testing, mobile UI/navigation, mobile-safe file workflows, notifications, internationalization, and receipt attachments.

## Repository snapshot

- `main` matches `origin/main`.
- Latest commit: `d5bd068` — *refactor: drop i18n for English-only UI and fix backup folder picker*.
- The repository is three commits ahead of the v0.1.0 tag.
- `package.json`, `Cargo.toml`, and `tauri.conf.json` still report version `0.1.0`.
- `CHANGELOG.md` has an unreleased `0.2.0` section.
- Linux v0.1.0 `.deb` and `.AppImage` files exist under `release-artifacts/`.
- At the start of this review, `expenses_tracker_project.odt` and `expenses_tracker_project.pdf` were untracked. They were not modified.

This means the checked-out code is **post-v0.1.0 development code**, but it has not yet been versioned or tagged as v0.2.0.

## Project structure

```text
Expense_Tracker/
├── src/                         React + TypeScript frontend
│   ├── App.tsx                  Desktop application shell and page selection
│   ├── pages/                   Dashboard, Expenses, Trash, Categories,
│   │                            Budgets, Reports, and Settings
│   ├── components/              Forms, charts, list items, navigation, and UI primitives
│   ├── store/                   Zustand stores for app and UI state
│   ├── hooks/                   Database startup, settings, theme, insights, and auto-backup
│   ├── lib/                     API bridge, backup, FX, dates, reports, parsing, and utilities
│   └── types/                   Shared TypeScript data types
├── src-tauri/                   Tauri 2 + Rust application
│   ├── src/
│   │   ├── lib.rs               Tauri plugins, managed state, and command registration
│   │   ├── commands.rs          Commands exposed to the frontend
│   │   ├── db.rs                SQLite connection, migrations, CRUD, backup files,
│   │   │                        recurring materialization, and insight queries
│   │   ├── models.rs            Rust request and response models
│   │   ├── insights.rs          Local rule-based insight engine
│   │   ├── fx_convert.rs        Currency conversion for backend insights
│   │   ├── error.rs             Errors returned through Tauri commands
│   │   └── backup.rs            Placeholder only; specified secure backup is not implemented
│   ├── migrations/              Three SQL migrations
│   ├── capabilities/            Desktop window permissions
│   ├── icons/                   Desktop, Android, and iOS icon assets
│   └── tauri.conf.json          Desktop-oriented Tauri configuration
├── docs/                        Release and smoke-test documentation
├── scripts/                     Linux dependency installer and smoke-test script
├── .github/workflows/           Tag-triggered Linux release workflow
├── stitch_minimal_expense_dashboard/
│                                  Original design mockups and generated HTML
├── Backups/                     Local JSON backup examples
└── release-artifacts/           Local v0.1.0 Linux packages
```

## Current architecture

### Desktop/Tauri mode

```text
React pages and components
        ↓
Zustand stores
        ↓
Typed wrappers in src/lib/api.ts
        ↓
Tauri commands in commands.rs
        ↓
AppDb in db.rs
        ↓
Local SQLite database
```

The Rust backend opens `expense_tracker.db` in the Tauri app-data directory, enables foreign keys, runs three custom migrations, and exposes synchronous database operations through Tauri commands.

### Browser development mode

Running `npm run dev` outside Tauri uses persisted Zustand/localStorage data instead of SQLite. This is useful for UI development, but it creates two persistence paths whose behavior can diverge. Recurring rules, for example, are only fully available in Tauri mode.

### Navigation

The application does not currently use React Router despite having it installed. `App.tsx` renders one page based on a `currentPage` value in the UI store. This is adequate for the current desktop application, although mobile navigation, back-button behavior, and deep linking will need an explicit design.

## Implemented feature inventory

### Core expense tracking

- Add and edit expenses
- Soft-delete expenses
- Restore or permanently delete expenses from Trash
- Amounts stored as integer minor units
- Per-expense currency, category, date, note, payment method, and tags
- Keyboard shortcut (`Ctrl/Cmd+N`) for quick add
- Quick-add parsing for amount, date, category, and note
- SQLite persistence in Tauri and localStorage fallback in browser mode

### Categories

- Create, edit, activate/deactivate, and delete categories
- Color and icon selection
- UI guard against deleting categories that are still used by expenses
- Category-level spending summary

### Dashboard, reports, and search

- Period-based totals and previous-period comparisons
- Weekly spending, daily average, and top category KPIs
- Daily trend and category charts with Recharts
- Recent transactions and budget progress
- Reports page with category breakdown, comparisons, trends, payment methods, insights, and transaction table
- Search across note, category, payment method, amount text, and currency
- Category, preset-period, and payment-method filters
- CSV export and printable statement

### Budgets

- Overall monthly limit
- Per-category limits
- Progress display
- 80% warning and 100% exceeded states
- Budget alert banners
- SQLite persistence

### Recurring expenses

- Create daily, weekly, or monthly rules
- Generate due expenses manually
- Automatic due-item materialization at application startup
- Soft-delete recurring rules
- Link generated expenses to their rule

### Multi-currency

- Supported UI currencies: USD, EUR, GBP, TRY, and SYP
- Local historical FX-rate storage
- Manual rate entry and CSV import
- Explicit, user-triggered ECB/Frankfurter refresh
- Direct, inverse, and cross-currency conversion
- Missing-rate warnings and exclusion from base-currency totals

### Settings and release support

- Light, dark, and system themes
- Accent color
- Base currency and configurable week-start day
- Default page and quick-add preferences
- Settings persisted to SQLite in Tauri mode
- Linux build/release workflow for tags
- Manual release guide and smoke-test checklist

## Roadmap status

Legend: **Complete** = success criteria are substantially met; **Partial** = useful implementation exists but important items remain; **Not started** = no meaningful implementation was found.

| Phase | Status | Assessment |
|---|---|---|
| Phase 0 — Planning and foundation | **Complete** | Specification, design assets, React/Tauri/Rust setup, SQLite schema, migrations, and repository structure exist. |
| Phase 1 — MVP core tracker | **Complete with caveats** | Expense CRUD, categories, dashboard, SQLite, themes, and simple search are working. Error handling and test coverage are still weak. |
| Phase 2 — Reporting and usability | **Mostly complete** | Period views, charts, filters, budgets, comparisons, and a quick-add shortcut exist. Custom ranges, amount filters, recurring/tag filters, and user-controlled sorting remain. |
| Phase 3 — Data safety and productivity | **Partial** | CSV/JSON export, JSON restore, auto-backup, recurring rules, and settings exist. The specification's integrity/security model and notifications are not implemented. |
| Phase 4 — Advanced experience | **Partial** | The five local smart-insight rules, comparisons, and quick-add parsing exist. Receipts, category suggestions, and i18n are absent; i18n was deliberately removed in the latest commit. |
| Phase 5 — Cross-platform expansion | **Not started** | Mobile entry-point support and icon assets exist, but there is no generated Android/iOS project, mobile navigation, responsive shell, or mobile-safe file flow. |
| Phase 6 — Polish and release | **Partial** | v0.1.0 Linux packages, release automation, and smoke-test documentation exist. Accessibility, performance, broader testing, and current post-v0.1 release verification remain. |

## Differences from the specification

### Data safety and backup

This is the most important mismatch.

- Current backups are JSON snapshots, not raw SQLite backups with a manifest and SHA-256 checksum.
- `src-tauri/src/backup.rs` contains only a comment; the planned Rust backup implementation does not exist.
- Recurring rules are **not included** in `AppBackupPayload`, yet restore deletes all current recurring rules. Restoring a backup can therefore permanently lose them.
- Restore supports replacement only. Merge and dry-run modes are missing.
- Restore does not automatically back up the current database before replacement.
- The UI calls the optional backup mode “encryption,” but it is repeating-key XOR plus Base64 in frontend code, not AES-256-GCM with Argon2id. It should not be presented as secure encryption.
- Backup parsing performs only shallow shape checks and has no checksum or schema compatibility validation.

### Database and deletion behavior

- Migrations are custom `rusqlite` migrations rather than the specified `tauri-plugin-sql` migration flow.
- There is no pre-migration backup, explicit per-migration transaction, or refusal to open a database with a newer schema.
- The 30-day automatic Trash cleanup is not implemented.
- Only expenses have a complete Trash workflow.
- Categories are hard-deleted after the UI usage check; budgets are replaced/deleted directly; recurring rules are soft-deleted but cannot be restored in the UI.
- Backend commands do not consistently validate positive amounts, supported currencies, valid dates/frequencies, non-empty values, or backup payload contents.

### Recurring behavior

- Rule editing, enable/disable controls, yearly frequency, and end-date entry are missing.
- Materialization uses the current UTC date rather than the user's local calendar date.
- It generates at most one expense for the current period and does not materialize missed historical occurrences.

### Search and reporting

- Search does not include expense tags even though tags are stored.
- There are no amount-range, custom date-range, or recurring/non-recurring filters.
- There is no visible sort control for date, amount, or category.
- “Last 3 months” currently starts at the beginning of the month three months ago and includes the current month, which covers four calendar months.

### Notifications, receipts, and language

- Budget alerts are in-app banners only; there are no native notifications or reminders.
- The weekly-digest setting is explicitly a saved placeholder.
- Receipt attachment is not implemented.
- The specification calls for English and Arabic with RTL support, but the project is currently English-only and has no i18n dependencies or locale files.

### Documentation and release consistency

- `README.md` still mentions a `src/locales` directory and a persisted language setting, although i18n was removed.
- The code is ahead of v0.1.0, while all application manifests still use `0.1.0`.
- `Cargo.lock` is ignored even though this is an application. Committing it would improve reproducible builds.

## Engineering risks to resolve before mobile

### 1. Protect user data

Replace the current backup implementation before relying on it for real data. At minimum:

1. Include recurring rules and all settings in the backup schema.
2. Validate backup versions and every imported record.
3. Create an automatic safety backup before replace.
4. Add integrity checking.
5. Either implement authenticated encryption correctly in Rust or remove/rename the current “encryption” option.

### 2. Make persistence failures visible

- The add/edit modal starts an asynchronous save but closes without awaiting it or showing an error.
- Budget and FX writes are frequently fire-and-forget.
- Database bootstrap marks the app ready even when startup work fails.

These paths can make the UI appear successful while the database operation failed. Mutations should expose loading, success, and failure states and should update in-memory state only after persistence succeeds.

### 3. Add backend validation and transactional operations

Frontend validation is not a security or integrity boundary. Validate all Tauri command inputs in Rust and use transactions for multi-step operations such as budget replacement, FX replacement, category deletion, recurring materialization, migrations, and restore.

### 4. Harden the Tauri boundary

- `csp` is currently `null`.
- The backup read command accepts an arbitrary file path.
- File operations and permissions are designed around a trusted desktop window.

Before shipping more broadly, enable a restrictive Content Security Policy, constrain command inputs to approved files/directories, and minimize capabilities by platform.

### 5. Increase automated coverage

Only two Rust insight tests exist and there is no frontend test command. High-value coverage should include:

- Money conversion and currency minor units
- Period boundaries and configurable weeks
- Quick-add parsing
- Search/filter behavior
- Budget rules
- Backup round-trip and invalid/corrupt backups
- SQLite CRUD, migrations, restore, and recurring materialization
- React form behavior and mobile navigation

## Mobile readiness assessment

### Existing foundations

- Tauri 2 is in use.
- The Rust crate includes `#[cfg_attr(mobile, tauri::mobile_entry_point)]`.
- Android and iOS icon assets exist.
- Most product logic is local and does not require an account or cloud service.
- Several content grids already collapse at Tailwind breakpoints.
- Amount fields use mobile-friendly input modes.

### Current blockers

- The top-level shell always renders a 240 px desktop sidebar.
- The Tauri window has a desktop minimum size of 960 × 600.
- There is no mobile navigation pattern or system back-button handling.
- Page padding, headers, transaction rows, tables, charts, settings panels, and five-button payment controls need narrow-screen designs.
- Modals are desktop dialogs rather than mobile full-screen pages or bottom sheets.
- No generated Android or iOS application project is present.
- Backup paths use desktop concepts such as `HOME`, arbitrary folders, and direct filesystem paths.
- CSV/JSON downloads and printing use browser DOM/iframe behavior that needs mobile-native save/share alternatives.
- Auto-backup depends on the app being open or focused; mobile background execution is different.
- The 720 KB minified JavaScript bundle is a mobile startup concern and currently triggers Vite's chunk-size warning.
- Mobile platform permissions and plugin compatibility have not been validated.

## Recommended next development sequence

### Milestone A — Desktop stabilization / backup v3

- Fix backup completeness, validation, integrity, restore safety, and encryption.
- Add Rust-side input validation and transactions.
- Await all mutations and show actionable errors.
- Fix the period-range bug and complete search/filter/sort behavior.
- Add a test framework and cover the core data rules.
- Commit `Cargo.lock`, align documentation, and decide whether the next version is v0.2.0.

### Milestone B — Responsive application shell

- Replace the persistent sidebar with:
  - desktop sidebar at large widths;
  - mobile bottom navigation or a compact drawer at small widths.
- Add safe-area support and touch targets of at least 44 × 44 px.
- Make the top bar, page padding, cards, tables, forms, and settings responsive from approximately 360 px upward.
- Use mobile cards instead of wide transaction/report tables.
- Present add/edit and budget forms as full-height mobile sheets or pages.
- Add route/history behavior suitable for Android/iOS back navigation.
- Lazy-load major pages/charts to reduce the initial bundle.

### Milestone C — Tauri mobile integration

- Start with Android unless an iOS/macOS toolchain is already available.
- Initialize the Tauri Android project and verify all Rust/plugins compile for the target.
- Separate desktop file operations from mobile document-picker/share operations.
- Configure platform-specific capabilities and permissions.
- Test SQLite creation, migration, restart persistence, restore, theme, and recurring generation on a real device.
- Add Android build and signing documentation, then repeat the process for iOS.

### Milestone D — Mobile release readiness

- Test common phone widths, rotation, dark mode, keyboard behavior, and safe areas.
- Run accessibility checks with screen readers and increased text size.
- Test with thousands of expenses and measure startup/chart performance.
- Add mobile CI where practical and create a mobile smoke-test checklist.

## Recommended immediate target

The next release should be a **v0.2.0 stabilization release**, with this definition of done:

- Backups restore every supported data type without silent loss.
- No feature is labeled encrypted unless it uses authenticated encryption.
- Core database and backup tests pass automatically.
- Persistence errors remain visible and do not close forms as if saving succeeded.
- Documentation and manifest versions agree.
- The desktop UI still passes the smoke test.
- A responsive shell works at 360, 390, 768, and desktop widths in browser/Tauri testing.

After that milestone, creating the Android target becomes a controlled platform task rather than mixing mobile work with unresolved desktop data-integrity issues.

## Verification performed during this review

| Check | Result | Notes |
|---|---|---|
| `npm run build` | **Pass** | Vite produced the frontend build; it warned that the main JS chunk is about 720 KB minified. |
| `cargo check` | **Pass** | One warning: unused `seed_if_empty` method. |
| `cargo test` | **Pass** | 2 passed, 0 failed; both tests cover insight rules. |
| Current full Tauri bundle | **Not rerun** | Existing documentation records a successful v0.1.0 `.deb` and AppImage build on 2026-05-23. |
| Current interactive smoke test | **Not rerun** | `docs/SMOKE_TEST.md` records the v0.1.0 manual checks, not the three later commits. |

## Overall conclusion

The project has a solid and presentable desktop MVP with more functionality than a typical college first release. It is already beyond the roadmap's basic expense-tracker stage. The next work should focus on reliability and mobile adaptation, not on adding more desktop features.

The reusable React/Rust/SQLite foundation is suitable for a mobile version, but the current application itself is still desktop-oriented. Once backup safety, error handling, validation, and tests are strengthened, the frontend can be reshaped for phone screens and then connected to Tauri Android/iOS with much lower risk.
