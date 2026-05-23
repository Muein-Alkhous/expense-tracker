-- Core tables: categories, expenses, budgets, recurring rules, app settings.

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency_code TEXT NOT NULL,
  category_id TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT,
  payment_method TEXT,
  tags_json TEXT,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_deleted ON expenses(deleted_at);

CREATE TABLE IF NOT EXISTS recurring_rules (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency_code TEXT NOT NULL,
  category_id TEXT NOT NULL,
  frequency TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_generated_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS budget_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_monthly_minor INTEGER NOT NULL DEFAULT 50000
);

INSERT OR IGNORE INTO budget_settings (id, total_monthly_minor) VALUES (1, 50000);

CREATE TABLE IF NOT EXISTS category_budgets (
  category_id TEXT PRIMARY KEY NOT NULL,
  limit_minor INTEGER NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
