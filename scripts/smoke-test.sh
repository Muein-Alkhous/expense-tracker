#!/usr/bin/env bash
# Automated smoke checks for v0.2.0 (launch + DB schema). Run interactive UI steps in docs/SMOKE_TEST.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/release-artifacts"
SMOKE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/expense-tracker-smoke.XXXXXX")"
trap 'rm -rf "$SMOKE_ROOT"' EXIT
mkdir -p "$SMOKE_ROOT/home" "$SMOKE_ROOT/data" "$SMOKE_ROOT/config" "$SMOKE_ROOT/cache"
DB="$SMOKE_ROOT/data/com.expensetracker.app/expense_tracker.db"

echo "== Bundle artifacts =="
test -f "$ART/Expense Tracker_0.2.0_amd64.deb"
test -x "$ART/Expense Tracker_0.2.0_amd64.AppImage"
file "$ART/Expense Tracker_0.2.0_amd64.AppImage" | grep -q 'ELF 64-bit'

echo "== App launch (5s) =="
if [[ -z "${DISPLAY:-}" ]]; then
  echo "WARN: DISPLAY unset; skipping GUI launch"
else
  set +e
  APPIMAGE_EXTRACT_AND_RUN=1 \
    HOME="$SMOKE_ROOT/home" \
    XDG_DATA_HOME="$SMOKE_ROOT/data" \
    XDG_CONFIG_HOME="$SMOKE_ROOT/config" \
    XDG_CACHE_HOME="$SMOKE_ROOT/cache" \
    timeout 5 "$ART/Expense Tracker_0.2.0_amd64.AppImage"
  status=$?
  set -e
  if [[ "$status" -ne 124 ]]; then
    echo "FAIL: application exited during startup (status $status)"
    exit 1
  fi
fi

echo "== SQLite schema =="
python3 <<PY
import os, sqlite3, sys
db = os.path.expanduser("$DB")
if not os.path.isfile(db):
    print("WARN: no isolated DB at", db, "(GUI launch was skipped)")
    sys.exit(0)
con = sqlite3.connect(db)
tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
required = {"expenses", "categories", "app_settings", "recurring_rules", "fx_rates", "schema_migrations"}
missing = required - tables
if missing:
    print("FAIL missing tables:", missing)
    sys.exit(1)
con.close()
print("OK schema")
PY

echo "SMOKE: automated checks passed"
