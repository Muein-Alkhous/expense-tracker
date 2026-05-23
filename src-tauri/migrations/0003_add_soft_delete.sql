-- Active-row views for queries that must ignore tombstones.

CREATE VIEW IF NOT EXISTS v_expenses_active AS
  SELECT * FROM expenses WHERE deleted_at IS NULL;

CREATE VIEW IF NOT EXISTS v_categories_active AS
  SELECT * FROM categories WHERE deleted_at IS NULL;

CREATE VIEW IF NOT EXISTS v_recurring_rules_active AS
  SELECT * FROM recurring_rules WHERE deleted_at IS NULL;
