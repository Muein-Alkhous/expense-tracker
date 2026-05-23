-- FX rates for multi-currency conversion.

CREATE TABLE IF NOT EXISTS fx_rates (
  id TEXT PRIMARY KEY NOT NULL,
  from_code TEXT NOT NULL,
  to_code TEXT NOT NULL,
  rate REAL NOT NULL,
  as_of_date TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fx_pair_date ON fx_rates(from_code, to_code, as_of_date);
CREATE INDEX IF NOT EXISTS idx_fx_lookup ON fx_rates(from_code, to_code, as_of_date DESC);
