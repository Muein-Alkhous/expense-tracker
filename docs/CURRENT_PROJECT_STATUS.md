# Expense Tracker — Current Status, Remaining Work, and Mobile Readiness

**Status date:** 2026-07-28  
**Current version:** 0.2.0 development  
**Current commit:** `7f1f9d7` (`feat: add secure backup and restore archives`)  
**Primary platform today:** Linux desktop  

## Executive summary

Expense Tracker is a functional local-first desktop application in the late-MVP/early-beta stage. Its main financial workflows are implemented, data is persisted in SQLite, deleted records and receipts are managed by the application, and the new `.etbackup` system provides substantially stronger backup and restore safety.

The current Linux application builds and launches successfully. Fresh `.deb`, `.rpm`, and `.AppImage` packages have been produced for version 0.2.0. The AppImage passed an isolated clean-profile startup and database-schema smoke test. The secure backup backend is covered by automated tests, including encryption, tamper detection, dry run, merge, staged replacement, safety backup, and recovery from an invalid staged restore.

Version 0.2.0 should not yet be treated as a fully finished public release. The most important remaining work is interactive testing of the new backup screens, broader persistence and migration hardening, frontend automated tests, security and accessibility improvements, Windows verification, and final release/tagging work.

For mobile, the project has a useful shared React/Rust/SQLite foundation, but the current product is still desktop-oriented. It is ready for mobile preparation and responsive design work, but not ready to generate and publish a reliable Android or iOS version.

## What is implemented now

### Core expense management

- Add and edit expenses.
- Store monetary values as integer minor units.
- Assign category, currency, date, note, payment method, and tags.
- Search and filter expense data.
- Soft-delete expenses and manage them from Trash.
- Restore or permanently remove trashed data.
- Load and persist desktop data through SQLite.
- Use a browser/localStorage mode for frontend-only development.

### Categories, budgets, reports, and currencies

- Category creation and management.
- Budget records and budget progress.
- Dashboard totals and charts.
- Reports and CSV export.
- Local FX-rate storage and base-currency conversion.
- Rule-based local spending insights.
- Frozen legacy recurring-expense support.

### Receipt attachments

- One managed receipt attachment per expense.
- JPEG, PNG, and WebP validation based on file content.
- Size and metadata validation.
- Application-managed receipt storage.
- Receipt preview/open, replace, and removal workflows.
- Receipt lifecycle integration with Trash and permanent deletion.
- Receipt inclusion and verification in complete backups.

### Trash and data lifecycle

- Normalized Trash support for the implemented record types.
- Restore and permanent-delete operations.
- Receipt preservation while an expense remains recoverable.
- Cleanup when an expense is permanently deleted.

### Secure `.etbackup` archives

The old frontend-generated desktop JSON backup path has been replaced by a backend-controlled archive format.

An unencrypted `.etbackup` is a ZIP-based container with:

- `manifest.json`
- A consistent SQLite snapshot
- Managed receipt files
- Application and schema versions
- Creation time and backup kind
- Base currency and record counts
- Artifact sizes and SHA-256 checksums

Manual archives can optionally be encrypted using:

- Argon2id password-based key derivation
- AES-256-GCM authenticated encryption
- A random salt and nonce
- No stored backup password

The restore pipeline now supports:

- **Inspection:** validates structure, limits, paths, checksums, schema, SQLite integrity, relationships, records, and receipt contents.
- **Dry run:** reports what would be added, skipped, or treated as a conflict without changing live data.
- **Merge:** transactionally inserts supported non-conflicting records and copies their receipts while preserving current settings and frozen recurring rules.
- **Replace:** creates a safety archive, stages the replacement, applies it at the next application start, validates the result, and rolls back if the swap fails.
- **Legacy import:** imports older JSON and legacy encrypted JSON through a restricted backend command without exposing arbitrary file contents to the frontend.

Automatic backups are unencrypted, clearly separate from manual/safety backups, and retain the newest ten automatic archives.

## Verification completed

| Check | Current result |
|---|---|
| Frontend TypeScript/Vite production build | Pass |
| Rust formatting | Pass |
| Rust Clippy with warnings denied | Pass |
| Rust test suite | Pass — 8 tests |
| Plain backup with database and receipt round trip | Pass |
| Encrypted backup with missing/wrong/correct password | Pass |
| Modified receipt/checksum rejection | Pass |
| Restore dry run | Pass |
| Merge restore with expense and receipt | Pass |
| Staged replace and safety archive | Pass |
| Invalid staged restore quarantine/recovery | Pass |
| Linux `.deb` build | Pass |
| Linux `.rpm` build | Pass |
| Linux `.AppImage` build | Pass |
| Release artifact checksums | Pass |
| AppImage clean-profile startup and SQLite schema | Pass |

The smoke test uses a temporary isolated profile. It does not read or modify the user's normal expense database.

## What remains for desktop

### Release-blocking verification

These checks should be completed before publishing a final version 0.2.0 release:

1. Create a plain `.etbackup` through Settings and inspect its contents.
2. Create an encrypted archive and confirm:
   - matching password confirmation is required;
   - a wrong password is rejected;
   - the correct password opens the archive.
3. Run the Merge workflow through the UI and verify the displayed dry-run counts, conflicts, imported records, and receipts.
4. Run Replace using a disposable profile, restart the application, verify the restored data, and verify that a safety archive was created.
5. Repeat the existing expense, category, budget, Trash, report, settings, recurring, and sample-data checks after the backup UI changes.
6. Install and test the packaged application rather than only launching the portable AppImage.
7. Build and smoke-test the Windows MSI/NSIS packages.

### Persistence and database hardening

- Apply structured validation consistently to every database mutation and imported record.
- Return stable typed error codes instead of relying mainly on error strings.
- Make all remaining multi-step mutations explicitly transactional.
- Keep forms open with their entered values when persistence fails.
- Add a recoverable database-startup error screen.
- Create a safety snapshot before migrations.
- Run each migration transactionally and reject databases created by a newer application schema.
- Expand database integration tests for CRUD, migrations, invalid input, transaction rollback, and startup failures.

### Product work still planned

- Complete shared date-range behavior across Dashboard, Reports, Budgets, filters, exports, and insights.
- Add the remaining advanced filters and sorting choices.
- Add local category suggestions without automatically overriding the user's selection.
- Replace automatic demo-data seeding with first-run onboarding.
- Add the local in-app reminder center and reminder deduplication.
- Provide a separate portable JSON export in addition to `.etbackup` and CSV.

Recurring expenses remain frozen legacy functionality. New recurring features are not part of the current completion scope.

### Security, accessibility, and performance

- Replace the current `csp: null` setting with a restrictive Content Security Policy.
- Reduce Tauri capabilities to the minimum required set.
- Add privacy-safe rotating diagnostic logs.
- Complete keyboard navigation, focus trapping/restoration, form labels, live status announcements, and contrast checks.
- Add automated accessibility tests.
- Lazy-load large page/chart modules; the production JavaScript bundle still triggers Vite's 500 KB chunk warning.
- Test performance with a large dataset, such as 10,000 expenses.

### Testing, CI, and release engineering

- Add frontend unit/component tests with Vitest and Testing Library.
- Add automated accessibility coverage.
- Expand Rust failure-injection and database integration coverage.
- Add CI checks for frontend tests/build, Rust formatting, strict Clippy, Rust tests, and package compilation.
- Add Windows CI and clean-profile Windows smoke tests.
- Decide whether unsigned Windows packages are acceptable or obtain signing credentials.
- Rerun the full manual checklist.
- Finalize the changelog, create the `v0.2.0` tag, and publish release assets.

## Mobile readiness

### Overall assessment

**Current mobile status: ready for preparation, not ready for packaging or release.**

The architecture does not need to be discarded. React, TypeScript, Rust, SQLite, typed command wrappers, and local-first business rules can all support a mobile version. However, the current interface and platform integrations assume a desktop environment.

### What can be reused

- Financial data models and integer-minor-unit money handling.
- SQLite schema and most Rust database logic.
- Expense, category, budget, FX, and report business rules.
- Backup validation and cryptographic archive logic.
- TypeScript domain types and state stores.
- Most non-visual utility functions.
- Local-first operation without requiring a hosted backend.
- Tauri 2 as a possible shared desktop/mobile shell.

This reusable foundation is the main reason mobile support is realistic.

### What is not mobile-ready

#### User interface

- The Tauri window currently has a minimum width of 960px.
- Navigation is desktop-oriented and has no mobile tab bar, drawer, or native back-button behavior.
- Dense tables, charts, dialogs, and Settings layouts have not been redesigned for phone widths.
- Touch target sizes, safe areas, virtual keyboard behavior, and portrait/landscape layouts are not verified.
- There is no responsive acceptance testing at common phone widths.

#### Platform integration

- Android and iOS projects have not been initialized.
- Mobile permissions have not been defined.
- Receipt capture does not yet integrate with the phone camera or mobile photo picker.
- Desktop file/folder selection does not map directly to Android/iOS document-provider and share-sheet workflows.
- Backup import/export needs a mobile document picker and share/export design.
- Application pause/resume, interrupted writes, low-storage conditions, and mobile process termination have not been tested.
- Native mobile notification behavior is not designed; current plans cover only in-app reminders.

#### Build and release

- Android SDK, NDK, JDK, Rust mobile targets, signing, and store packaging are not configured.
- iOS development and release require macOS, Xcode, Apple signing, and App Store configuration.
- There are no mobile CI jobs, emulator tests, physical-device tests, or store release procedures.

### Mobile readiness by area

| Area | Readiness | Explanation |
|---|---|---|
| Core financial model | Strong | Mostly platform-independent and already backed by SQLite |
| Rust business/database layer | Moderate to strong | Reusable, but mobile lifecycle and failure testing are still needed |
| Backup cryptography/validation | Strong foundation | Core logic is reusable; mobile file selection and sharing are not |
| React state and utilities | Moderate to strong | Much can be shared after platform boundaries are made explicit |
| Phone user interface | Low | Desktop layouts and navigation require a deliberate mobile shell |
| Mobile permissions and files | Low | Camera, photo picker, document provider, and sharing are not integrated |
| Android build readiness | Low | Target has not been initialized or tested |
| iOS build readiness | Low | Target has not been initialized and requires a macOS/Xcode environment |
| Mobile release readiness | Not ready | No signing, CI, store metadata, emulator, or device validation |

## Recommended path to mobile

Mobile work should proceed in controlled stages rather than immediately generating store packages.

### Stage 1 — Finish the desktop reliability milestone

- Complete the interactive backup/restore checklist.
- Strengthen validation, migrations, errors, and transaction tests.
- Add frontend tests.
- Enable CSP and reduce capabilities.
- Finish the version 0.2.0 desktop release.

This gives mobile development a stable data model and prevents desktop data-safety issues from being duplicated on another platform.

### Stage 2 — Create a responsive application shell

- Define phone navigation and information hierarchy.
- Add layouts for approximately 360px, 390px, 768px, and desktop widths.
- Replace or adapt desktop-only tables and dialogs.
- Add touch-size controls, safe-area support, and virtual-keyboard handling.
- Test Dashboard, Expenses, Add/Edit, Trash, Reports, Budgets, and Settings at phone widths in the browser before adding native targets.

### Stage 3 — Introduce explicit platform adapters

Separate shared product logic from platform-specific behavior for:

- Database/application data directories
- Receipt selection and camera capture
- Opening receipt files
- Backup import/export and sharing
- Permissions
- Application lifecycle
- Notifications

The shared code should call these adapters instead of branching throughout pages and stores.

### Stage 4 — Initialize Android

- Install the Android SDK/NDK/JDK and Rust Android targets.
- Initialize the Tauri Android project.
- Configure application ID, icons, permissions, signing, and minimum SDK.
- Verify database migrations and storage paths on an emulator and physical device.
- Test interruption, background/resume, low storage, receipt selection, and backup sharing.

Android is the practical first native target because it can be built from Linux.

### Stage 5 — Initialize iOS

- Move this stage to a macOS machine with Xcode.
- Initialize the Tauri iOS project.
- Configure bundle ID, signing, entitlements, privacy descriptions, and App Store metadata.
- Repeat database, lifecycle, receipt, backup, and physical-device testing.

### Stage 6 — Mobile release hardening

- Add mobile unit, integration, emulator, and device tests.
- Add Android CI and an appropriate macOS iOS CI workflow.
- Perform accessibility, performance, battery, and storage testing.
- Prepare privacy disclosures and store listings.
- Produce signed beta builds before public release.

## Recommended immediate next step

Complete the four pending secure-backup UI checks in `docs/SMOKE_TEST.md`, then begin persistence/error hardening and frontend test setup. Responsive mobile-shell work can start in parallel as a design/prototype exercise, but native Android/iOS target generation should wait until the desktop 0.2.0 reliability milestone is closed.

## Related documents

- `docs/DESKTOP_COMPLETION_PLAN.md` — detailed desktop implementation plan
- `docs/SMOKE_TEST.md` — automated results and manual release checklist
- `docs/RELEASE.md` — release procedure
- `CHANGELOG.md` — version history
- `expense_tracker_spec_roadmap.md` — original product roadmap

