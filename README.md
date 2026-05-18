# Expense Tracker

A fast, privacy-focused, local-first expense tracking desktop application.
Built with Tauri, React, TypeScript, Rust, and SQLite.

See [expense_tracker_spec_roadmap.md](expense_tracker_spec_roadmap.md) for the full specification.

## Tech stack

- **Tauri** — desktop application shell
- **React + TypeScript + Vite** — frontend
- **Tailwind CSS** — styling
- **Zustand** — state management
- **Rust + SQLite** — backend and local storage

## Project layout

```text
src/         React frontend (pages, components, lib, store, types, locales)
src-tauri/   Rust backend (commands, db, migrations, backup, insights)
```

## Development

```bash
npm install        # install frontend deps
npm run tauri dev  # run the desktop app in dev mode
```

## Build

```bash
npm run tauri build
```

## Status

Project is in scaffold stage. See the spec roadmap for phased feature delivery.
