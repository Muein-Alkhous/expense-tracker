# Desktop Completion Plan — Expense Tracker v0.2.0

## Summary

Complete and release the desktop application for Linux and Windows before beginning any mobile work. The release will finish data safety, advanced filtering, receipts, local suggestions/reminders, onboarding, accessibility, performance, testing, and packaging.

Recurring expenses remain frozen exactly as they are and are excluded from new feature work and acceptance criteria. Existing recurring data must survive full backup replacement, but merge restore will not add or modify recurring rules. Internationalization remains removed.

## Implementation progress

As of 2026-07-28, the secure-backup milestone in section 3 is implemented in the desktop code:

- `.etbackup` archives contain a consistent SQLite snapshot, managed receipts, and a versioned checksum manifest.
- Manual backups support authenticated Argon2id + AES-256-GCM encryption; automatic archives remain unencrypted and retain the newest 10.
- Inspection validates archive paths and limits, checksums, SQLite integrity and relationships, schema compatibility, financial records, and receipt content.
- Restore supports no-write dry run, transactional Merge, and safety-backed staged Replace with startup verification and rollback.
- Merge preserves current settings and frozen recurring rules. Full replacement preserves the complete backed-up database.
- Legacy JSON import remains available through a restricted backend command; arbitrary file-content reads are no longer exposed to the frontend.
- Rust tests cover receipt round trips, modification detection, missing/wrong passwords, dry run, merge, replacement, and rollback staging.

The rebuilt Linux AppImage passes an isolated clean-profile startup/schema smoke test. Interactive UI testing of plain/encrypted archive creation and both restore choices, plus broader failure-injection coverage, remains before this milestone is considered release-complete.

## Implementation Plan

### 1. Stabilize persistence and database evolution

- Add structured Rust validation for amounts, currencies, dates, categories, tags, budgets, FX rates, file inputs, and imported records.
- Return typed command errors with stable error codes and user-friendly messages.
- Make expense, category, budget, FX, restore, and multi-step delete operations transactional.
- Await frontend mutations before closing forms or reporting success; retain entered data and show retryable errors when persistence fails.
- Replace silent startup completion with a recoverable database error screen offering retry, log location, and restore.
- Strengthen migrations with:
  - a pre-migration SQLite snapshot;
  - one transaction per migration;
  - rejection of databases newer than the application;
  - immutable forward-only migration files.
- Commit `Cargo.lock` and remove unused persistence plugins/dependencies where the Rust database layer already owns the behavior.

### 2. Complete the deletion and budget models

- Replace `budget_settings` and `category_budgets` with normalized budget records containing IDs, currency, period, timestamps, and `deleted_at`; migrate all existing limits without loss.
- Support optional global and category budgets, with only one active budget per category/period.
- Extend Trash to expenses, categories, and budgets with restore, permanent delete, empty-by-type, and age display.
- Soft-deleting a category also tombstones its active category budget in the same transaction.
- Restoring that category restores the budget deleted by the same operation.
- Add a protected built-in `Uncategorized` category. Permanently purging a category reassigns its expenses transactionally.
- Purge records older than 30 days during startup. Receipts remain while an expense is recoverable and are removed only on permanent deletion.
- Block a budget restore when an active budget already occupies the same category/period and explain how to resolve it.

### 3. Replace backup and restore with a secure archive

- Introduce `.etbackup` archives containing:
  - a consistent SQLite snapshot;
  - app-managed receipt files;
  - a manifest with app/schema versions, timestamps, base currency, active/deleted counts, and artifact metadata;
  - SHA-256 checksums for the database and every receipt.
- Add optional manual-backup encryption using Argon2id-derived keys and AES-256-GCM. Remove the current XOR/Base64 feature and never store passwords.
- Automatic backups remain clearly labeled local and unencrypted, retain the newest 10 automatic archives, and never prune manual archives.
- Verify archive paths, checksums, SQLite integrity, schema compatibility, record validity, and receipt metadata before any restore.
- Implement restore modes:
  - **Dry run:** report additions, conflicts, skipped records, attachment counts, and incompatibilities.
  - **Merge:** insert new supported records by ID, skip conflicts, preserve current settings, and leave frozen recurring rules untouched.
  - **Replace:** create a safety archive, stage the database and receipts, and atomically apply them at the next restart with automatic rollback on failure.
- Preserve legacy v1/v2 JSON import for existing users, but perform strict validation and never delete live recurring rules during legacy import.
- Add a separate portable JSON data export and retain filtered CSV export; Excel remains optional and out of scope.
- Remove commands that return arbitrary file contents to the frontend. Backup inspection and receipt access must operate through validated Rust commands.

### 4. Finish desktop product features

- Add `this_week`, `last_week`, and custom date ranges using the configured week-start day.
- Fix “Last 3 months” so it covers exactly three calendar months.
- Expand expense filtering to tags, base-currency amount range, custom dates, all payment methods including transfer, and category.
- Add date, amount, and category sorting with ascending/descending controls; missing-FX expenses sort last for base-currency amount sorting.
- Make Dashboard, Reports, Budgets, CSV export, and insights use the same shared date-range semantics.
- Add local category suggestions:
  - score normalized note matches, token overlap, frequency, and recency from existing expenses;
  - show up to three suggestions;
  - never change the selected category without user action;
  - never override a category explicitly parsed by quick add.
- Add one receipt image per expense:
  - accept JPEG, PNG, or WebP up to 10 MB;
  - copy it into app-managed storage using generated names;
  - store original name, MIME type, size, checksum, and timestamps;
  - support preview, open, replace, and remove;
  - validate content rather than trusting the extension.
- For a new expense, save the expense first and then attach the selected receipt. If attachment fails, retain the saved expense and present a clear recovery action.
- Keep receipts desktop-only in browser development mode with an explanatory disabled state.

### 5. Add onboarding and in-app reminders

- Replace automatic demo expenses on a new database with a short first-run setup:
  - base currency;
  - week-start day;
  - automatic-backup choice and default platform document folder.
- Finish with default categories and an empty ledger. Legacy/imported users bypass onboarding.
- Keep sample data as an explicit Settings action and create a safety backup before replacing existing data.
- Replace the placeholder Notifications section with an in-app reminder center and Top Bar unread indicator.
- Derive reminders locally for:
  - no expense logged after the configured daily reminder time;
  - budget reaching 80% or 100%;
  - overdue or failed automatic backup;
  - optional weekly spending digest.
- Deduplicate and persist dismissals by reminder type and period. Do not add OS notifications, background services, telemetry, email, or recurring-expense reminders.

### 6. Security, accessibility, and performance polish

- Enable a restrictive CSP allowing only packaged assets and the explicitly user-triggered Frankfurter FX endpoint.
- Minimize Tauri capabilities and constrain file operations to configured backup storage, app-managed receipts, or files explicitly selected through native dialogs.
- Add local rotating diagnostic logs that omit notes, amounts, passwords, receipt contents, and other financial data.
- Add labels and error descriptions to forms, modal focus trapping/restoration, keyboard-operable menus, visible focus states, live status regions, and contrast checks.
- Replace unnecessary `dangerouslySetInnerHTML` usage.
- Lazy-load page/chart modules, paginate long rendered lists, and keep the initial production JavaScript chunk below Vite’s 500 KB warning threshold.
- Verify responsive behavior only within the supported desktop minimum window; do not design phone layouts or mobile navigation in this plan.
- Validate acceptable interaction and chart performance with at least 10,000 expenses.

### 7. Testing, CI, documentation, and release

- Add Vitest, Testing Library, user-event, and axe-based component accessibility tests.
- Refactor the Rust database layer to open temporary database paths for integration tests.
- Cover:
  - validation, CRUD, migrations, transactions, and startup failure;
  - money/FX conversion and date boundaries;
  - filters, sorting, quick add, suggestions, and budgets;
  - Trash dependency behavior and 30-day purge;
  - receipt validation, replacement, backup, and deletion;
  - reminder generation and deduplication;
  - encrypted/unencrypted backup, tampering, wrong passwords, newer schemas, legacy JSON, dry run, merge, replace, and rollback;
  - first-run onboarding and existing-user upgrades.
- Add CI for Linux and Windows running frontend tests/build, Rust formatting, Clippy with warnings denied, Rust tests, and package compilation.
- Extend tagged releases to produce Linux `.deb`/AppImage and unsigned Windows MSI/NSIS artifacts.
- Add clean-profile smoke tests for both platforms and document Windows SmartScreen behavior until signing credentials exist.
- Synchronize version `0.2.0` across all manifests and update the changelog, README, roadmap, release guide, smoke checklist, and project-status report.
- Remove stale i18n/locales documentation and state that recurring expenses are frozen legacy functionality outside the supported completion scope.

## Public Interfaces and Data Changes

- Add normalized `Budget`, `ReceiptAttachment`, `DateRange`, `ExpenseFilters`, `ExpenseSort`, `Reminder`, `BackupInspection`, and `RestoreSummary` shared types.
- Change expense mutations to return the persisted `Expense` and structured failures.
- Add receipt commands for attach, metadata/preview retrieval, open, replace, and remove using receipt/expense IDs rather than arbitrary managed-file paths.
- Replace raw JSON backup commands with create, inspect, dry-run, merge, and staged-replace commands.
- Add forward migrations for normalized budgets, receipt metadata, deletion indexes, protected Uncategorized data, and any new settings metadata.
- Preserve v0.1 databases, legacy JSON backups, existing expense IDs, timestamps, FX data, and frozen recurring tables.

## Completion Criteria

- A clean Linux or Windows installation completes onboarding and starts with default categories but no fake expenses.
- All current financial workflows persist correctly and visibly report failures.
- Filters, sorting, reports, budgets, suggestions, receipts, reminders, Trash, and exports behave consistently.
- Backups detect corruption, restore attachments, support all three restore modes, and cannot silently erase current data.
- Encrypted backups use authenticated encryption; automatic backups are explicitly unencrypted.
- Accessibility checks, frontend tests, Rust tests, production builds, and platform smoke tests pass.
- Linux and Windows release artifacts are produced from the same v0.2.0 tag.

## Explicit Boundaries and Assumptions

- No new recurring-expense code, behavior, UI, tests, or documentation beyond preserving existing data during full replacement backups.
- No internationalization or RTL work.
- No OS-native/background notifications; reminders are in-app only.
- One image receipt per expense; PDFs and multiple attachments are excluded.
- Linux and Windows are supported; macOS is excluded.
- No mobile responsive shell, mobile navigation, Android/iOS initialization, mobile permissions, or mobile release planning.
- Existing untracked college ODT/PDF files remain untouched.
