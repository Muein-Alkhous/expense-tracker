// SQLite connection, migrations, and data access.

use std::path::PathBuf;
use std::sync::Mutex;

use chrono::Datelike;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::Manager;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::{
    AppBackupPayload, BackupFileInfo, BudgetsSnapshot, Category, CategoryBudgetRow, DbCounts,
    Expense, FxRate, GetInsightsInput, Insight, MaterializeRecurringResult, NewCategoryInput,
    NewExpenseInput, NewFxRateInput, NewRecurringRuleInput, RecurringRule,
};

pub struct AppDb {
    conn: Mutex<Connection>,
}

const MIGRATIONS: &[(&str, i32)] = &[
    ("0001_init", 1),
    ("0002_add_fx_rates", 2),
    ("0003_add_soft_delete", 3),
];

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn tags_to_json(tags: &Option<Vec<String>>) -> Option<String> {
    tags.as_ref()
        .filter(|t| !t.is_empty())
        .map(|t| serde_json::to_string(t).unwrap_or_else(|_| "[]".to_string()))
}

fn tags_from_json(raw: Option<String>) -> Option<Vec<String>> {
    let s = raw?;
    if s.is_empty() {
        return None;
    }
    serde_json::from_str(&s).ok()
}

impl AppDb {
    pub fn open(app: &tauri::AppHandle) -> AppResult<Self> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Message(e.to_string()))?;
        std::fs::create_dir_all(&dir)?;
        let path = dir.join("expense_tracker.db");
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.run_migrations()?;
        Ok(db)
    }

    fn with_conn<F, T>(&self, f: F) -> AppResult<T>
    where
        F: FnOnce(&Connection) -> AppResult<T>,
    {
        let conn = self.conn.lock().map_err(|_| AppError::Message("DB lock poisoned".into()))?;
        f(&conn)
    }

    fn run_migrations(&self) -> AppResult<()> {
        self.with_conn(|conn| {
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY NOT NULL,
                    applied_at TEXT NOT NULL
                );",
            )?;

            for (name, version) in MIGRATIONS {
                let applied: Option<i32> = conn
                    .query_row(
                        "SELECT version FROM schema_migrations WHERE version = ?1",
                        [version],
                        |row| row.get(0),
                    )
                    .optional()?;

                if applied.is_some() {
                    continue;
                }

                let sql = match *name {
                    "0001_init" => include_str!("../migrations/0001_init.sql"),
                    "0002_add_fx_rates" => include_str!("../migrations/0002_add_fx_rates.sql"),
                    "0003_add_soft_delete" => include_str!("../migrations/0003_add_soft_delete.sql"),
                    _ => continue,
                };

                conn.execute_batch(sql)?;
                conn.execute(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
                    params![version, now_iso()],
                )?;
            }
            Ok(())
        })
    }

    pub fn counts(&self) -> AppResult<DbCounts> {
        self.with_conn(|conn| {
            let expenses: i64 =
                conn.query_row("SELECT COUNT(*) FROM expenses", [], |r| r.get(0))?;
            let categories: i64 =
                conn.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))?;
            Ok(DbCounts {
                expenses,
                categories,
            })
        })
    }

    pub fn list_expenses(&self) -> AppResult<Vec<Expense>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, amount_minor, currency_code, category_id, date, note, payment_method,
                        tags_json, is_recurring, recurrence_id, created_at, updated_at, deleted_at
                 FROM expenses ORDER BY date DESC, created_at DESC",
            )?;
            let rows = stmt.query_map([], map_expense_row)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn create_expense(&self, input: NewExpenseInput) -> AppResult<Expense> {
        let id = Uuid::new_v4().to_string();
        let now = now_iso();
        let tags_json = tags_to_json(&input.tags);
        let expense = Expense {
            id: id.clone(),
            amount_minor: input.amount_minor,
            currency_code: input.currency_code.clone(),
            category_id: input.category_id.clone(),
            date: input.date.clone(),
            note: input.note.clone(),
            payment_method: input.payment_method.clone(),
            tags: input.tags.clone(),
            is_recurring: false,
            recurrence_id: None,
            created_at: now.clone(),
            updated_at: now.clone(),
            deleted_at: None,
        };

        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO expenses (id, amount_minor, currency_code, category_id, date, note,
                 payment_method, tags_json, is_recurring, recurrence_id, created_at, updated_at, deleted_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,NULL,?9,?9,NULL)",
                params![
                    expense.id,
                    expense.amount_minor,
                    expense.currency_code,
                    expense.category_id,
                    expense.date,
                    expense.note,
                    expense.payment_method,
                    tags_json,
                    now,
                ],
            )?;
            Ok(expense)
        })
    }

    pub fn update_expense(&self, id: &str, input: NewExpenseInput) -> AppResult<Expense> {
        let now = now_iso();
        let tags_json = tags_to_json(&input.tags);
        self.with_conn(|conn| {
            let existing: Expense = conn
                .query_row(
                    "SELECT id, amount_minor, currency_code, category_id, date, note, payment_method,
                            tags_json, is_recurring, recurrence_id, created_at, updated_at, deleted_at
                     FROM expenses WHERE id = ?1",
                    [id],
                    map_expense_row,
                )
                .map_err(|_| AppError::Message("Expense not found".into()))?;

            conn.execute(
                "UPDATE expenses SET amount_minor=?2, currency_code=?3, category_id=?4, date=?5,
                 note=?6, payment_method=?7, tags_json=?8, updated_at=?9 WHERE id=?1",
                params![
                    id,
                    input.amount_minor,
                    input.currency_code,
                    input.category_id,
                    input.date,
                    input.note,
                    input.payment_method,
                    tags_json,
                    now,
                ],
            )?;

            Ok(Expense {
                amount_minor: input.amount_minor,
                currency_code: input.currency_code,
                category_id: input.category_id,
                date: input.date,
                note: input.note,
                payment_method: input.payment_method,
                tags: input.tags,
                updated_at: now,
                ..existing
            })
        })
    }

    pub fn soft_delete_expense(&self, id: &str) -> AppResult<()> {
        let now = now_iso();
        self.with_conn(|conn| {
            let n = conn.execute(
                "UPDATE expenses SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1",
                params![id, now],
            )?;
            if n == 0 {
                return Err(AppError::Message("Expense not found".into()));
            }
            Ok(())
        })
    }

    pub fn restore_expense(&self, id: &str) -> AppResult<()> {
        let now = now_iso();
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE expenses SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1",
                params![id, now],
            )?;
            Ok(())
        })
    }

    pub fn permanent_delete_expense(&self, id: &str) -> AppResult<()> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM expenses WHERE id = ?1", [id])?;
            Ok(())
        })
    }

    pub fn empty_trash(&self) -> AppResult<()> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM expenses WHERE deleted_at IS NOT NULL", [])?;
            Ok(())
        })
    }

    pub fn list_categories(&self) -> AppResult<Vec<Category>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, color, icon, is_active, created_at, updated_at, deleted_at
                 FROM categories ORDER BY name",
            )?;
            let rows = stmt.query_map([], map_category_row)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn create_category(&self, input: NewCategoryInput) -> AppResult<Category> {
        let id = Uuid::new_v4().to_string();
        let now = now_iso();
        let cat = Category {
            id: id.clone(),
            name: input.name,
            color: input.color,
            icon: input.icon,
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
            deleted_at: None,
        };
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO categories (id, name, color, icon, is_active, created_at, updated_at, deleted_at)
                 VALUES (?1,?2,?3,?4,1,?5,?5,NULL)",
                params![cat.id, cat.name, cat.color, cat.icon, now],
            )?;
            Ok(cat)
        })
    }

    pub fn update_category(
        &self,
        id: &str,
        name: &str,
        color: &str,
        icon: &str,
        is_active: bool,
    ) -> AppResult<Category> {
        let now = now_iso();
        self.with_conn(|conn| {
            let existing: Category = conn
                .query_row(
                    "SELECT id, name, color, icon, is_active, created_at, updated_at, deleted_at
                     FROM categories WHERE id = ?1",
                    [id],
                    map_category_row,
                )
                .map_err(|_| AppError::Message("Category not found".into()))?;

            conn.execute(
                "UPDATE categories SET name=?2, color=?3, icon=?4, is_active=?5, updated_at=?6 WHERE id=?1",
                params![id, name, color, icon, is_active as i32, now],
            )?;

            Ok(Category {
                name: name.to_string(),
                color: color.to_string(),
                icon: icon.to_string(),
                is_active,
                updated_at: now,
                ..existing
            })
        })
    }

    pub fn delete_category(&self, id: &str) -> AppResult<()> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM category_budgets WHERE category_id = ?1", [id])?;
            conn.execute("DELETE FROM categories WHERE id = ?1", [id])?;
            Ok(())
        })
    }

    pub fn get_budgets(&self) -> AppResult<BudgetsSnapshot> {
        self.with_conn(|conn| {
            let total: i64 = conn
                .query_row(
                    "SELECT total_monthly_minor FROM budget_settings WHERE id = 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(50000);

            let mut stmt =
                conn.prepare("SELECT category_id, limit_minor FROM category_budgets")?;
            let items = stmt
                .query_map([], |row| {
                    Ok(CategoryBudgetRow {
                        category_id: row.get(0)?,
                        limit_minor: row.get(1)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(BudgetsSnapshot {
                total_monthly_minor: total,
                items,
            })
        })
    }

    pub fn set_budgets(&self, snapshot: &BudgetsSnapshot) -> AppResult<()> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO budget_settings (id, total_monthly_minor) VALUES (1, ?1)
                 ON CONFLICT(id) DO UPDATE SET total_monthly_minor = excluded.total_monthly_minor",
                [snapshot.total_monthly_minor],
            )?;
            conn.execute("DELETE FROM category_budgets", [])?;
            for row in &snapshot.items {
                conn.execute(
                    "INSERT INTO category_budgets (category_id, limit_minor) VALUES (?1, ?2)",
                    params![row.category_id, row.limit_minor],
                )?;
            }
            Ok(())
        })
    }

    pub fn list_fx_rates(&self) -> AppResult<Vec<FxRate>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, from_code, to_code, rate, as_of_date FROM fx_rates
                 ORDER BY as_of_date DESC, from_code, to_code",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(FxRate {
                    id: row.get(0)?,
                    from_code: row.get(1)?,
                    to_code: row.get(2)?,
                    rate: row.get(3)?,
                    as_of_date: row.get(4)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn upsert_fx_rate(&self, input: NewFxRateInput) -> AppResult<FxRate> {
        let (from, to, rate) = normalize_fx_pair(&input.from_code, &input.to_code, input.rate);
        let id = Uuid::new_v4().to_string();
        let now = now_iso();

        self.with_conn(|conn| {
            if let Some(existing_id) = conn
                .query_row(
                    "SELECT id FROM fx_rates WHERE from_code = ?1 AND to_code = ?2 AND as_of_date = ?3",
                    params![from, to, input.as_of_date],
                    |r| r.get::<_, String>(0),
                )
                .optional()?
            {
                conn.execute(
                    "UPDATE fx_rates SET rate = ?2, updated_at = ?3 WHERE id = ?1",
                    params![existing_id, rate, now],
                )?;
                return Ok(FxRate {
                    id: existing_id,
                    from_code: from,
                    to_code: to,
                    rate,
                    as_of_date: input.as_of_date,
                });
            }

            conn.execute(
                "INSERT INTO fx_rates (id, from_code, to_code, rate, as_of_date, source, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,'manual',?6,?6)",
                params![id, from, to, rate, input.as_of_date, now],
            )?;
            Ok(FxRate {
                id,
                from_code: from,
                to_code: to,
                rate,
                as_of_date: input.as_of_date,
            })
        })
    }

    pub fn remove_fx_rate(&self, id: &str) -> AppResult<()> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM fx_rates WHERE id = ?1", [id])?;
            Ok(())
        })
    }

    pub fn replace_fx_rates(&self, rates: &[FxRate]) -> AppResult<()> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM fx_rates", [])?;
            let now = now_iso();
            for r in rates {
                let (from, to, rate) = normalize_fx_pair(&r.from_code, &r.to_code, r.rate);
                conn.execute(
                    "INSERT INTO fx_rates (id, from_code, to_code, rate, as_of_date, source, created_at, updated_at)
                     VALUES (?1,?2,?3,?4,?5,'import',?6,?6)",
                    params![r.id, from, to, rate, r.as_of_date, now],
                )?;
            }
            Ok(())
        })
    }

    pub fn list_recurring_rules(&self) -> AppResult<Vec<RecurringRule>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, title, amount_minor, currency_code, category_id, frequency, start_date,
                        end_date, is_active, last_generated_date, created_at, updated_at, deleted_at
                 FROM recurring_rules ORDER BY title",
            )?;
            let rows = stmt.query_map([], map_recurring_row)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn create_recurring_rule(&self, input: NewRecurringRuleInput) -> AppResult<RecurringRule> {
        let id = Uuid::new_v4().to_string();
        let now = now_iso();
        let rule = RecurringRule {
            id: id.clone(),
            title: input.title,
            amount_minor: input.amount_minor,
            currency_code: input.currency_code,
            category_id: input.category_id,
            frequency: input.frequency,
            start_date: input.start_date,
            end_date: input.end_date,
            is_active: true,
            last_generated_date: None,
            created_at: now.clone(),
            updated_at: now.clone(),
            deleted_at: None,
        };
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO recurring_rules (id, title, amount_minor, currency_code, category_id,
                 frequency, start_date, end_date, is_active, last_generated_date, created_at, updated_at, deleted_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,NULL,?9,?9,NULL)",
                params![
                    rule.id,
                    rule.title,
                    rule.amount_minor,
                    rule.currency_code,
                    rule.category_id,
                    rule.frequency,
                    rule.start_date,
                    rule.end_date,
                    now,
                ],
            )?;
            Ok(rule)
        })
    }

    pub fn delete_recurring_rule(&self, id: &str) -> AppResult<()> {
        let now = now_iso();
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE recurring_rules SET deleted_at = ?2, updated_at = ?2, is_active = 0 WHERE id = ?1",
                params![id, now],
            )?;
            Ok(())
        })
    }

    pub fn materialize_recurring_due(&self) -> AppResult<MaterializeRecurringResult> {
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, title, amount_minor, currency_code, category_id, frequency, start_date,
                        end_date, is_active, last_generated_date, created_at, updated_at, deleted_at
                 FROM recurring_rules WHERE deleted_at IS NULL AND is_active = 1",
            )?;
            let rules: Vec<RecurringRule> = stmt
                .query_map([], map_recurring_row)?
                .collect::<Result<Vec<_>, _>>()?;

            let mut created = 0i32;
            for rule in rules {
                if rule.start_date > today {
                    continue;
                }
                if let Some(ref end) = rule.end_date {
                    if end < &today {
                        continue;
                    }
                }

                let period_key = recurring_period_key(&rule.frequency, &today);
                let last = rule.last_generated_date.as_deref().unwrap_or("");
                if last >= period_key.as_str() {
                    continue;
                }

                let expense_id = Uuid::new_v4().to_string();
                let now = now_iso();
                let note = format!("Recurring: {}", rule.title);
                conn.execute(
                    "INSERT INTO expenses (id, amount_minor, currency_code, category_id, date, note,
                     payment_method, tags_json, is_recurring, recurrence_id, created_at, updated_at, deleted_at)
                     VALUES (?1,?2,?3,?4,?5,?6,NULL,NULL,1,?7,?8,?8,NULL)",
                    params![
                        expense_id,
                        rule.amount_minor,
                        rule.currency_code,
                        rule.category_id,
                        today,
                        note,
                        rule.id,
                        now,
                    ],
                )?;
                conn.execute(
                    "UPDATE recurring_rules SET last_generated_date = ?2, updated_at = ?3 WHERE id = ?1",
                    params![rule.id, period_key, now],
                )?;
                created += 1;
            }
            Ok(MaterializeRecurringResult { created })
        })
    }

    pub fn import_backup(&self, payload: &AppBackupPayload) -> AppResult<()> {
        self.with_conn(|conn| {
            conn.execute_batch("BEGIN IMMEDIATE;")?;
            let result: AppResult<()> = (|| {
                conn.execute("DELETE FROM expenses", [])?;
                conn.execute("DELETE FROM category_budgets", [])?;
                conn.execute("DELETE FROM categories", [])?;
                conn.execute("DELETE FROM fx_rates", [])?;
                conn.execute("DELETE FROM recurring_rules", [])?;

                for cat in &payload.categories {
                    conn.execute(
                        "INSERT INTO categories (id, name, color, icon, is_active, created_at, updated_at, deleted_at)
                         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                        params![
                            cat.id,
                            cat.name,
                            cat.color,
                            cat.icon,
                            cat.is_active as i32,
                            cat.created_at,
                            cat.updated_at,
                            cat.deleted_at,
                        ],
                    )?;
                }

                for e in &payload.expenses {
                    let tags_json = tags_to_json(&e.tags);
                    conn.execute(
                        "INSERT INTO expenses (id, amount_minor, currency_code, category_id, date, note,
                         payment_method, tags_json, is_recurring, recurrence_id, created_at, updated_at, deleted_at)
                         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
                        params![
                            e.id,
                            e.amount_minor,
                            e.currency_code,
                            e.category_id,
                            e.date,
                            e.note,
                            e.payment_method,
                            tags_json,
                            e.is_recurring as i32,
                            e.recurrence_id,
                            e.created_at,
                            e.updated_at,
                            e.deleted_at,
                        ],
                    )?;
                }

                conn.execute(
                    "INSERT INTO budget_settings (id, total_monthly_minor) VALUES (1, ?1)
                     ON CONFLICT(id) DO UPDATE SET total_monthly_minor = excluded.total_monthly_minor",
                    [payload.budgets.total_monthly_minor],
                )?;
                for b in &payload.budgets.items {
                    conn.execute(
                        "INSERT INTO category_budgets (category_id, limit_minor) VALUES (?1, ?2)",
                        params![b.category_id, b.limit_minor],
                    )?;
                }

                if let Some(rates) = &payload.fx_rates {
                    let now = now_iso();
                    for r in rates {
                        let (from, to, rate) = normalize_fx_pair(&r.from_code, &r.to_code, r.rate);
                        conn.execute(
                            "INSERT INTO fx_rates (id, from_code, to_code, rate, as_of_date, source, created_at, updated_at)
                             VALUES (?1,?2,?3,?4,?5,'import',?6,?6)",
                            params![r.id, from, to, rate, r.as_of_date, now],
                        )?;
                    }
                }

                conn.execute(
                    "INSERT INTO app_settings (key, value) VALUES ('ui_settings', ?1)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    [payload.settings.to_string()],
                )?;

                conn.execute(
                    "INSERT INTO schema_meta (key, value) VALUES ('imported_from_local', '1')
                     ON CONFLICT(key) DO UPDATE SET value = '1'",
                    [],
                )?;

                Ok(())
            })();

            if result.is_err() {
                let _ = conn.execute_batch("ROLLBACK;");
                result?;
            } else {
                conn.execute_batch("COMMIT;")?;
            }
            Ok(())
        })
    }

    pub fn seed_if_empty(&self) -> AppResult<bool> {
        let counts = self.counts()?;
        if counts.expenses > 0 || counts.categories > 0 {
            return Ok(false);
        }
        Ok(true)
    }

    pub fn save_backup_file(&self, dir: &str, content: &str, file_extension: &str) -> AppResult<String> {
        let path = resolve_backup_dir(dir)?;
        std::fs::create_dir_all(&path)?;
        let stamp = chrono::Utc::now().format("%Y-%m-%d_%H%M").to_string();
        let ext = file_extension.trim_start_matches('.');
        let filename = format!("expense_tracker_backup_{stamp}.{ext}");
        let file_path = path.join(&filename);
        std::fs::write(&file_path, content)?;
        Ok(file_path.to_string_lossy().to_string())
    }

    pub fn list_backups(&self, dir: &str) -> AppResult<Vec<BackupFileInfo>> {
        let path = resolve_backup_dir(dir)?;
        if !path.exists() {
            return Ok(Vec::new());
        }
        let mut files: Vec<BackupFileInfo> = Vec::new();
        for entry in std::fs::read_dir(&path)? {
            let entry = entry?;
            let meta = entry.metadata()?;
            if !meta.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with("expense_tracker_backup_") {
                continue;
            }
            if !(name.ends_with(".json") || name.ends_with(".enc.json")) {
                continue;
            }
            let modified_at = meta
                .modified()
                .ok()
                .map(|t| {
                    let dt: chrono::DateTime<chrono::Utc> = t.into();
                    dt.format("%Y-%m-%d %H:%M").to_string()
                })
                .unwrap_or_else(|| "—".to_string());
            files.push(BackupFileInfo {
                encrypted: name.ends_with(".enc.json"),
                name: name.clone(),
                path: entry.path().to_string_lossy().to_string(),
                size_bytes: meta.len(),
                modified_at,
            });
        }
        files.sort_by(|a, b| b.path.cmp(&a.path));
        Ok(files)
    }

    pub fn read_backup_file(&self, file_path: &str) -> AppResult<String> {
        let path = PathBuf::from(file_path);
        if !path.is_file() {
            return Err(AppError::Message("Backup file not found.".into()));
        }
        Ok(std::fs::read_to_string(path)?)
    }

    pub fn get_ui_settings(&self) -> AppResult<Option<serde_json::Value>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = 'ui_settings'")?;
            let mut rows = stmt.query([])?;
            if let Some(row) = rows.next()? {
                let raw: String = row.get(0)?;
                let value: serde_json::Value = serde_json::from_str(&raw)?;
                return Ok(Some(value));
            }
            Ok(None)
        })
    }

    pub fn set_ui_settings(&self, settings: &serde_json::Value) -> AppResult<()> {
        let raw = serde_json::to_string(settings)?;
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO app_settings (key, value) VALUES ('ui_settings', ?1)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [raw],
            )?;
            Ok(())
        })
    }

    pub fn get_insights(&self, input: GetInsightsInput) -> AppResult<Vec<Insight>> {
        let expenses = self.list_expenses()?;
        let categories = self.list_categories()?;
        let budgets = self.get_budgets()?;
        let fx_rates = self.list_fx_rates()?;
        Ok(crate::insights::compute_insights(
            &expenses,
            &categories,
            &budgets.items,
            &fx_rates,
            &input.base_currency,
            &input.period_start,
            &input.period_end,
            input.prev_start.as_deref(),
            input.prev_end.as_deref(),
        ))
    }
}

fn resolve_backup_dir(dir: &str) -> AppResult<PathBuf> {
    let trimmed = dir.trim();
    if trimmed.is_empty() {
        return Err(AppError::Message("Backup path cannot be empty.".into()));
    }
    if trimmed == "~" {
        if let Ok(home) = std::env::var("HOME") {
            return Ok(PathBuf::from(home));
        }
    }
    if let Some(rest) = trimmed.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return Ok(PathBuf::from(home).join(rest));
        }
    }
    Ok(PathBuf::from(trimmed))
}

fn normalize_fx_pair(from: &str, to: &str, rate: f64) -> (String, String, f64) {
    let from = from.to_uppercase();
    let to = to.to_uppercase();
    if from < to {
        (from, to, rate)
    } else {
        (to, from, 1.0 / rate)
    }
}

fn recurring_period_key(frequency: &str, today: &str) -> String {
    match frequency {
        "weekly" => {
            if let Ok(d) = chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d") {
                let weekday = d.weekday().num_days_from_monday();
                let monday = d - chrono::Duration::days(weekday as i64);
                return monday.format("%Y-%m-%d").to_string();
            }
            today.to_string()
        }
        "daily" => today.to_string(),
        _ => {
            if let Ok(d) = chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d") {
                return d.format("%Y-%m").to_string();
            }
            today.to_string()
        }
    }
}

fn map_expense_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Expense> {
    Ok(Expense {
        id: row.get(0)?,
        amount_minor: row.get(1)?,
        currency_code: row.get(2)?,
        category_id: row.get(3)?,
        date: row.get(4)?,
        note: row.get(5)?,
        payment_method: row.get(6)?,
        tags: tags_from_json(row.get(7)?),
        is_recurring: row.get::<_, i32>(8)? != 0,
        recurrence_id: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        deleted_at: row.get(12)?,
    })
}

fn map_category_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Category> {
    Ok(Category {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        icon: row.get(3)?,
        is_active: row.get::<_, i32>(4)? != 0,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        deleted_at: row.get(7)?,
    })
}

fn map_recurring_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<RecurringRule> {
    Ok(RecurringRule {
        id: row.get(0)?,
        title: row.get(1)?,
        amount_minor: row.get(2)?,
        currency_code: row.get(3)?,
        category_id: row.get(4)?,
        frequency: row.get(5)?,
        start_date: row.get(6)?,
        end_date: row.get(7)?,
        is_active: row.get::<_, i32>(8)? != 0,
        last_generated_date: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        deleted_at: row.get(12)?,
    })
}
