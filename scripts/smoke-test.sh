#!/usr/bin/env bash
# Automated smoke checks for v0.2.0 (launch + DB schema). Run interactive UI steps in docs/SMOKE_TEST.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/release-artifacts"
DB="${XDG_DATA_HOME:-$HOME/.local/share}/com.expensetracker.app/expense_tracker.db"

echo "== Bundle artifacts =="
test -f "$ART/Expense Tracker_0.2.0_amd64.deb"
test -x "$ART/Expense Tracker_0.2.0_amd64.AppImage"
file "$ART/Expense Tracker_0.2.0_amd64.AppImage" | grep -q 'ELF 64-bit'

echo "== App launch (5s) =="
if [[ -z "${DISPLAY:-}" ]]; then
  echo "WARN: DISPLAY unset; skipping GUI launch"
else
  timeout 5 "$ART/Expense Tracker_0.2.0_amd64.AppImage" &
  pid=$!
  sleep 3
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
fi

echo "== SQLite schema =="
python3 <<PY
import os, sqlite3, sys
db = os.path.expanduser("$DB")
if not os.path.isfile(db):
    print("WARN: no DB at", db, "(first run — launch app once)")
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
