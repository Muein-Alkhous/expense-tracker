-- Desktop v0.2 foundation: normalized budgets, receipt metadata, and protected
-- Uncategorized data. Released migrations are never edited; this migration
-- preserves the legacy budget tables for downgrade/forensics compatibility.

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT,
  limit_amount_minor INTEGER NOT NULL CHECK (limit_amount_minor > 0),
  currency_code TEXT NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'monthly',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_active_scope
  ON budgets(COALESCE(category_id, '__overall__'), period_type)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_budgets_deleted ON budgets(deleted_at);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category_id);

INSERT OR IGNORE INTO budgets (
  id, category_id, limit_amount_minor, currency_code, period_type,
  created_at, updated_at, deleted_at
)
SELECT
  'budget-overall-monthly',
  NULL,
  total_monthly_minor,
  COALESCE(
    json_extract((SELECT value FROM app_settings WHERE key = 'ui_settings'), '$.baseCurrency'),
    'USD'
  ),
  'monthly',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  NULL
FROM budget_settings
WHERE id = 1 AND total_monthly_minor > 0;

INSERT OR IGNORE INTO budgets (
  id, category_id, limit_amount_minor, currency_code, period_type,
  created_at, updated_at, deleted_at
)
SELECT
  'budget-category-' || category_id,
  category_id,
  limit_minor,
  COALESCE(
    json_extract((SELECT value FROM app_settings WHERE key = 'ui_settings'), '$.baseCurrency'),
    'USD'
  ),
  'monthly',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  NULL
FROM category_budgets
WHERE limit_minor > 0;

CREATE TABLE IF NOT EXISTS receipt_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  expense_id TEXT NOT NULL UNIQUE,
  stored_name TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_receipts_expense ON receipt_attachments(expense_id);

INSERT OR IGNORE INTO categories (
  id, name, color, icon, is_active, created_at, updated_at, deleted_at
) VALUES (
  '__uncategorized__',
  'Uncategorized',
  '#737373',
  'more-horizontal',
  1,
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  NULL
);

CREATE VIEW IF NOT EXISTS v_budgets_active AS
  SELECT * FROM budgets WHERE deleted_at IS NULL;
