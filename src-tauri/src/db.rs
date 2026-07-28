// SQLite connection, migrations, and data access.

use std::path::PathBuf;
use std::sync::Mutex;

use base64::Engine;
use chrono::Datelike;
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use tauri::Manager;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::{
    AppBackupPayload, BackupFileInfo, Budget, BudgetsSnapshot, Category, CategoryBudgetRow,
    DbCounts, Expense, FxRate, GetInsightsInput, Insight, MaterializeRecurringResult,
    NewCategoryInput, NewExpenseInput, NewFxRateInput, NewRecurringRuleInput, ReceiptAttachment,
    RecurringRule, TrashSnapshot,
};

pub struct AppDb {
    conn: Mutex<Connection>,
    data_dir: PathBuf,
    db_path: PathBuf,
}

const MIGRATIONS: &[(&str, i32)] = &[
    ("0001_init", 1),
    ("0002_add_fx_rates", 2),
    ("0003_add_soft_delete", 3),
    ("0004_desktop_completion", 4),
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

fn validate_currency(code: &str) -> AppResult<()> {
    if code.len() != 3 || !code.chars().all(|c| c.is_ascii_uppercase()) {
        return Err(AppError::Message(
            "Currency must be a three-letter uppercase ISO code.".into(),
        ));
    }
    Ok(())
}

fn validate_date(date: &str, field: &str) -> AppResult<()> {
    chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map(|_| ())
        .map_err(|_| AppError::Message(format!("{field} must use YYYY-MM-DD.")))
}

fn validate_expense_input(input: &NewExpenseInput) -> AppResult<()> {
    if input.amount_minor <= 0 {
        return Err(AppError::Message(
            "Amount must be greater than zero.".into(),
        ));
    }
    if input.amount_minor > 9_000_000_000_000_000 {
        return Err(AppError::Message("Amount is too large.".into()));
    }
    validate_currency(&input.currency_code)?;
    validate_date(&input.date, "Expense date")?;
    if input.category_id.trim().is_empty() {
        return Err(AppError::Message("Choose a category.".into()));
    }
    if input
        .note
        .as_deref()
        .is_some_and(|note| note.chars().count() > 500)
    {
        return Err(AppError::Message(
            "Expense notes cannot exceed 500 characters.".into(),
        ));
    }
    if let Some(method) = input.payment_method.as_deref() {
        if !matches!(method, "cash" | "card" | "transfer" | "bank" | "other") {
            return Err(AppError::Message("Unsupported payment method.".into()));
        }
    }
    if let Some(tags) = &input.tags {
        if tags.len() > 20
            || tags
                .iter()
                .any(|tag| tag.trim().is_empty() || tag.chars().count() > 40)
        {
            return Err(AppError::Message(
                "Use at most 20 non-empty tags of 40 characters or fewer.".into(),
            ));
        }
    }
    Ok(())
}

fn ensure_category_available(conn: &Connection, category_id: &str) -> AppResult<()> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM categories WHERE id = ?1 AND deleted_at IS NULL
        )",
        [category_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(AppError::Message(
            "The selected category is unavailable.".into(),
        ));
    }
    Ok(())
}

fn ensure_category_exists(conn: &Connection, category_id: &str) -> AppResult<()> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM categories WHERE id = ?1)",
        [category_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(AppError::Message(
            "Backup references a category that it does not contain.".into(),
        ));
    }
    Ok(())
}

fn validate_category_values(name: &str, color: &str, icon: &str) -> AppResult<()> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(AppError::Message(
            "Category name must contain 1 to 80 characters.".into(),
        ));
    }
    if color.len() != 7
        || !color.starts_with('#')
        || !color[1..].chars().all(|c| c.is_ascii_hexdigit())
    {
        return Err(AppError::Message(
            "Category color must be a hexadecimal color such as #6366f1.".into(),
        ));
    }
    if icon.trim().is_empty() || icon.chars().count() > 64 {
        return Err(AppError::Message("Choose a valid category icon.".into()));
    }
    Ok(())
}

impl AppDb {
    pub fn open(app: &tauri::AppHandle) -> AppResult<Self> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Message(e.to_string()))?;
        std::fs::create_dir_all(&dir)?;
        let path = dir.join("expense_tracker.db");
        let existed = path.exists();
        let mut conn = Connection::open(&path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Self::run_migrations(&mut conn, &path, existed)?;
        let db = Self {
            conn: Mutex::new(conn),
            data_dir: dir,
            db_path: path,
        };
        db.purge_expired_trash(30)?;
        Ok(db)
    }

    pub(crate) fn with_conn<F, T>(&self, f: F) -> AppResult<T>
    where
        F: FnOnce(&Connection) -> AppResult<T>,
    {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Message("DB lock poisoned".into()))?;
        f(&conn)
    }

    fn run_migrations(
        conn: &mut Connection,
        db_path: &std::path::Path,
        existed: bool,
    ) -> AppResult<()> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY NOT NULL,
                applied_at TEXT NOT NULL
            );",
        )?;

        let current: i32 = conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )?;
        let latest = MIGRATIONS.last().map(|(_, version)| *version).unwrap_or(0);
        if current > latest {
            return Err(AppError::Message(format!(
                "This database uses schema version {current}, but this app only supports up to {latest}. Install a newer version of Expense Tracker."
            )));
        }

        let pending = MIGRATIONS.iter().any(|(_, version)| *version > current);
        if existed && current > 0 && pending {
            conn.execute_batch("PRAGMA wal_checkpoint(FULL);")?;
            let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
            let backup_path = db_path.with_extension(format!(
                "db.pre-migration-{current}-to-{latest}-{stamp}.bak"
            ));
            std::fs::copy(db_path, backup_path)?;
        }

        for (name, version) in MIGRATIONS {
            if *version <= current {
                continue;
            }
            let sql = match *name {
                "0001_init" => include_str!("../migrations/0001_init.sql"),
                "0002_add_fx_rates" => include_str!("../migrations/0002_add_fx_rates.sql"),
                "0003_add_soft_delete" => include_str!("../migrations/0003_add_soft_delete.sql"),
                "0004_desktop_completion" => {
                    include_str!("../migrations/0004_desktop_completion.sql")
                }
                _ => {
                    return Err(AppError::Message(format!(
                        "Migration source is missing for {name}"
                    )))
                }
            };

            let tx = conn.transaction()?;
            tx.execute_batch(sql)?;
            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
                params![version, now_iso()],
            )?;
            tx.commit()?;
        }
        Ok(())
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
        validate_expense_input(&input)?;
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
            ensure_category_available(conn, &input.category_id)?;
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
        validate_expense_input(&input)?;
        let now = now_iso();
        let tags_json = tags_to_json(&input.tags);
        self.with_conn(|conn| {
            ensure_category_available(conn, &input.category_id)?;
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
        let stored_name = self.with_conn(|conn| {
            let stored_name: Option<String> = conn
                .query_row(
                    "SELECT stored_name FROM receipt_attachments WHERE expense_id = ?1",
                    [id],
                    |row| row.get(0),
                )
                .optional()?;
            let changed = conn.execute(
                "DELETE FROM expenses WHERE id = ?1 AND deleted_at IS NOT NULL",
                [id],
            )?;
            if changed == 0 {
                return Err(AppError::Message("Deleted expense not found.".into()));
            }
            Ok(stored_name)
        })?;
        if let Some(name) = stored_name {
            self.remove_receipt_file(&name)?;
        }
        Ok(())
    }

    pub fn empty_trash(&self) -> AppResult<()> {
        let stored_names = self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT r.stored_name
                 FROM receipt_attachments r
                 JOIN expenses e ON e.id = r.expense_id
                 WHERE e.deleted_at IS NOT NULL",
            )?;
            let names = stmt
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            drop(stmt);

            let mut category_stmt = conn.prepare(
                "SELECT id FROM categories
                 WHERE id <> '__uncategorized__' AND deleted_at IS NOT NULL",
            )?;
            let category_ids = category_stmt
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            drop(category_stmt);

            let tx = conn.unchecked_transaction()?;
            tx.execute("DELETE FROM expenses WHERE deleted_at IS NOT NULL", [])?;
            let now = now_iso();
            for id in category_ids {
                tx.execute(
                    "UPDATE expenses SET category_id = '__uncategorized__', updated_at = ?2
                     WHERE category_id = ?1",
                    params![id, now],
                )?;
                tx.execute(
                    "UPDATE recurring_rules
                     SET category_id = '__uncategorized__', updated_at = ?2
                     WHERE category_id = ?1",
                    params![id, now],
                )?;
                tx.execute("DELETE FROM budgets WHERE category_id = ?1", [&id])?;
                tx.execute("DELETE FROM category_budgets WHERE category_id = ?1", [&id])?;
                tx.execute("DELETE FROM categories WHERE id = ?1", [&id])?;
            }
            tx.execute("DELETE FROM budgets WHERE deleted_at IS NOT NULL", [])?;
            tx.commit()?;
            Ok(names)
        })?;
        for name in stored_names {
            self.remove_receipt_file(&name)?;
        }
        Ok(())
    }

    pub fn list_categories(&self) -> AppResult<Vec<Category>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, color, icon, is_active, created_at, updated_at, deleted_at
                 FROM categories WHERE deleted_at IS NULL ORDER BY name",
            )?;
            let rows = stmt.query_map([], map_category_row)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn create_category(&self, input: NewCategoryInput) -> AppResult<Category> {
        validate_category_values(&input.name, &input.color, &input.icon)?;
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
        validate_category_values(name, color, icon)?;
        if id == "__uncategorized__" && !is_active {
            return Err(AppError::Message(
                "The Uncategorized category cannot be deactivated.".into(),
            ));
        }
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
        if id == "__uncategorized__" {
            return Err(AppError::Message(
                "The Uncategorized category cannot be deleted.".into(),
            ));
        }
        let now = now_iso();
        self.with_conn(|conn| {
            let tx = conn.unchecked_transaction()?;
            let changed = tx.execute(
                "UPDATE categories
                 SET deleted_at = ?2, updated_at = ?2, is_active = 0
                 WHERE id = ?1 AND deleted_at IS NULL",
                params![id, now],
            )?;
            if changed == 0 {
                return Err(AppError::Message("Category not found.".into()));
            }
            tx.execute(
                "UPDATE budgets SET deleted_at = ?2, updated_at = ?2
                 WHERE category_id = ?1 AND deleted_at IS NULL",
                params![id, now],
            )?;
            tx.commit()?;
            Ok(())
        })
    }

    pub fn get_budgets(&self) -> AppResult<BudgetsSnapshot> {
        self.with_conn(|conn| {
            let total: i64 = conn
                .query_row(
                    "SELECT limit_amount_minor FROM budgets
                     WHERE category_id IS NULL AND period_type = 'monthly'
                       AND deleted_at IS NULL
                     LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(50000);

            let mut stmt = conn.prepare(
                "SELECT category_id, limit_amount_minor FROM budgets
                 WHERE category_id IS NOT NULL AND period_type = 'monthly'
                   AND deleted_at IS NULL",
            )?;
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
        if snapshot.total_monthly_minor <= 0 {
            return Err(AppError::Message(
                "The total monthly budget must be greater than zero.".into(),
            ));
        }
        let mut seen = std::collections::HashSet::new();
        let mut allocated = 0i64;
        for row in &snapshot.items {
            if row.category_id.trim().is_empty()
                || row.limit_minor <= 0
                || !seen.insert(row.category_id.as_str())
            {
                return Err(AppError::Message(
                    "Category budgets must use unique categories and positive limits.".into(),
                ));
            }
            allocated = allocated
                .checked_add(row.limit_minor)
                .ok_or_else(|| AppError::Message("Budget total is too large.".into()))?;
        }
        if allocated > snapshot.total_monthly_minor {
            return Err(AppError::Message(
                "Category budgets cannot exceed the overall monthly budget.".into(),
            ));
        }

        let now = now_iso();
        self.with_conn(|conn| {
            for row in &snapshot.items {
                ensure_category_available(conn, &row.category_id)?;
            }
            let base_currency = current_base_currency(conn);
            let tx = conn.unchecked_transaction()?;
            tx.execute(
                "INSERT INTO budgets (
                    id, category_id, limit_amount_minor, currency_code, period_type,
                    created_at, updated_at, deleted_at
                 ) VALUES (
                    'budget-overall-monthly', NULL, ?1, ?2, 'monthly', ?3, ?3, NULL
                 )
                 ON CONFLICT(id) DO UPDATE SET
                    limit_amount_minor = excluded.limit_amount_minor,
                    currency_code = excluded.currency_code,
                    updated_at = excluded.updated_at,
                    deleted_at = NULL",
                params![snapshot.total_monthly_minor, base_currency, now],
            )?;

            let incoming: Vec<String> = snapshot
                .items
                .iter()
                .map(|row| format!("budget-category-{}", row.category_id))
                .collect();
            let mut stmt = tx.prepare(
                "SELECT id FROM budgets
                 WHERE category_id IS NOT NULL AND period_type = 'monthly'
                   AND deleted_at IS NULL",
            )?;
            let existing = stmt
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            drop(stmt);
            for id in existing {
                if !incoming.contains(&id) {
                    tx.execute(
                        "UPDATE budgets SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1",
                        params![id, now],
                    )?;
                }
            }

            for row in &snapshot.items {
                let id = format!("budget-category-{}", row.category_id);
                tx.execute(
                    "INSERT INTO budgets (
                        id, category_id, limit_amount_minor, currency_code, period_type,
                        created_at, updated_at, deleted_at
                     ) VALUES (?1, ?2, ?3, ?4, 'monthly', ?5, ?5, NULL)
                     ON CONFLICT(id) DO UPDATE SET
                        category_id = excluded.category_id,
                        limit_amount_minor = excluded.limit_amount_minor,
                        currency_code = excluded.currency_code,
                        updated_at = excluded.updated_at,
                        deleted_at = NULL",
                    params![id, row.category_id, row.limit_minor, base_currency, now],
                )?;
            }
            tx.commit()?;
            Ok(())
        })
    }

    pub fn list_trash(&self) -> AppResult<TrashSnapshot> {
        self.with_conn(|conn| {
            let mut expense_stmt = conn.prepare(
                "SELECT id, amount_minor, currency_code, category_id, date, note, payment_method,
                        tags_json, is_recurring, recurrence_id, created_at, updated_at, deleted_at
                 FROM expenses WHERE deleted_at IS NOT NULL
                 ORDER BY deleted_at DESC",
            )?;
            let expenses = expense_stmt
                .query_map([], map_expense_row)?
                .collect::<Result<Vec<_>, _>>()?;

            let mut category_stmt = conn.prepare(
                "SELECT id, name, color, icon, is_active, created_at, updated_at, deleted_at
                 FROM categories WHERE deleted_at IS NOT NULL
                 ORDER BY deleted_at DESC",
            )?;
            let categories = category_stmt
                .query_map([], map_category_row)?
                .collect::<Result<Vec<_>, _>>()?;

            let mut budget_stmt = conn.prepare(
                "SELECT id, category_id, limit_amount_minor, currency_code, period_type,
                        created_at, updated_at, deleted_at
                 FROM budgets WHERE deleted_at IS NOT NULL
                 ORDER BY deleted_at DESC",
            )?;
            let budgets = budget_stmt
                .query_map([], map_budget_row)?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(TrashSnapshot {
                expenses,
                categories,
                budgets,
            })
        })
    }

    pub fn restore_category(&self, id: &str) -> AppResult<()> {
        let now = now_iso();
        self.with_conn(|conn| {
            let deleted_at: String = conn
                .query_row(
                    "SELECT deleted_at FROM categories
                     WHERE id = ?1 AND deleted_at IS NOT NULL",
                    [id],
                    |row| row.get(0),
                )
                .map_err(|_| AppError::Message("Deleted category not found.".into()))?;
            let tx = conn.unchecked_transaction()?;
            tx.execute(
                "UPDATE categories
                 SET deleted_at = NULL, updated_at = ?2, is_active = 1
                 WHERE id = ?1",
                params![id, now],
            )?;
            tx.execute(
                "UPDATE budgets SET deleted_at = NULL, updated_at = ?3
                 WHERE category_id = ?1 AND deleted_at = ?2
                   AND NOT EXISTS (
                     SELECT 1 FROM budgets active
                     WHERE active.category_id = ?1
                       AND active.period_type = budgets.period_type
                       AND active.deleted_at IS NULL
                   )",
                params![id, deleted_at, now],
            )?;
            tx.commit()?;
            Ok(())
        })
    }

    pub fn permanent_delete_category(&self, id: &str) -> AppResult<()> {
        if id == "__uncategorized__" {
            return Err(AppError::Message(
                "The Uncategorized category cannot be deleted.".into(),
            ));
        }
        self.with_conn(|conn| {
            let tx = conn.unchecked_transaction()?;
            tx.execute(
                "UPDATE expenses SET category_id = '__uncategorized__', updated_at = ?2
                 WHERE category_id = ?1",
                params![id, now_iso()],
            )?;
            tx.execute(
                "UPDATE recurring_rules SET category_id = '__uncategorized__', updated_at = ?2
                 WHERE category_id = ?1",
                params![id, now_iso()],
            )?;
            tx.execute("DELETE FROM budgets WHERE category_id = ?1", [id])?;
            tx.execute("DELETE FROM category_budgets WHERE category_id = ?1", [id])?;
            let changed = tx.execute(
                "DELETE FROM categories WHERE id = ?1 AND deleted_at IS NOT NULL",
                [id],
            )?;
            if changed == 0 {
                return Err(AppError::Message("Deleted category not found.".into()));
            }
            tx.commit()?;
            Ok(())
        })
    }

    pub fn restore_budget(&self, id: &str) -> AppResult<()> {
        let now = now_iso();
        self.with_conn(|conn| {
            let budget: Budget = conn
                .query_row(
                    "SELECT id, category_id, limit_amount_minor, currency_code, period_type,
                            created_at, updated_at, deleted_at
                     FROM budgets WHERE id = ?1 AND deleted_at IS NOT NULL",
                    [id],
                    map_budget_row,
                )
                .map_err(|_| AppError::Message("Deleted budget not found.".into()))?;
            if let Some(category_id) = budget.category_id.as_deref() {
                ensure_category_available(conn, category_id)?;
            }
            let conflict: bool = conn.query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM budgets
                    WHERE id <> ?1
                      AND COALESCE(category_id, '__overall__') =
                          COALESCE(?2, '__overall__')
                      AND period_type = ?3
                      AND deleted_at IS NULL
                )",
                params![id, budget.category_id, budget.period_type],
                |row| row.get(0),
            )?;
            if conflict {
                return Err(AppError::Message(
                    "An active budget already exists for this category and period.".into(),
                ));
            }
            conn.execute(
                "UPDATE budgets SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1",
                params![id, now],
            )?;
            Ok(())
        })
    }

    pub fn permanent_delete_budget(&self, id: &str) -> AppResult<()> {
        self.with_conn(|conn| {
            let changed = conn.execute(
                "DELETE FROM budgets WHERE id = ?1 AND deleted_at IS NOT NULL",
                [id],
            )?;
            if changed == 0 {
                return Err(AppError::Message("Deleted budget not found.".into()));
            }
            Ok(())
        })
    }

    pub fn get_receipt(&self, expense_id: &str) -> AppResult<Option<ReceiptAttachment>> {
        self.with_conn(|conn| {
            conn.query_row(
                "SELECT id, expense_id, original_name, mime_type, size_bytes, sha256,
                        created_at, updated_at
                 FROM receipt_attachments WHERE expense_id = ?1",
                [expense_id],
                map_receipt_row,
            )
            .optional()
            .map_err(Into::into)
        })
    }

    pub fn attach_receipt(
        &self,
        expense_id: &str,
        source_path: &str,
    ) -> AppResult<ReceiptAttachment> {
        let expense_exists = self.with_conn(|conn| {
            conn.query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM expenses WHERE id = ?1 AND deleted_at IS NULL
                )",
                [expense_id],
                |row| row.get::<_, bool>(0),
            )
            .map_err(Into::into)
        })?;
        if !expense_exists {
            return Err(AppError::Message(
                "Attach receipts only to an active expense.".into(),
            ));
        }

        let source = std::fs::canonicalize(source_path)?;
        if !source.is_file() {
            return Err(AppError::Message("Receipt file was not found.".into()));
        }
        let metadata = std::fs::metadata(&source)?;
        const MAX_RECEIPT_BYTES: u64 = 10 * 1024 * 1024;
        if metadata.len() == 0 || metadata.len() > MAX_RECEIPT_BYTES {
            return Err(AppError::Message(
                "Receipt images must be between 1 byte and 10 MB.".into(),
            ));
        }
        let bytes = std::fs::read(&source)?;
        let (mime_type, extension) = detect_receipt_type(&bytes).ok_or_else(|| {
            AppError::Message("Receipt must be a JPEG, PNG, or WebP image.".into())
        })?;
        let original_name = source
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("receipt")
            .to_string();
        let sha256 = format!("{:x}", Sha256::digest(&bytes));
        let stored_name = format!("{}.{}", Uuid::new_v4(), extension);
        let receipts_dir = self.receipts_dir();
        std::fs::create_dir_all(&receipts_dir)?;
        let destination = receipts_dir.join(&stored_name);
        let temporary = receipts_dir.join(format!(".{stored_name}.tmp"));
        std::fs::write(&temporary, &bytes)?;
        std::fs::rename(&temporary, &destination)?;

        let now = now_iso();
        let id = Uuid::new_v4().to_string();
        let result = self.with_conn(|conn| {
            let old_name: Option<String> = conn
                .query_row(
                    "SELECT stored_name FROM receipt_attachments WHERE expense_id = ?1",
                    [expense_id],
                    |row| row.get(0),
                )
                .optional()?;
            conn.execute(
                "INSERT INTO receipt_attachments (
                    id, expense_id, stored_name, original_name, mime_type, size_bytes,
                    sha256, created_at, updated_at
                 ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)
                 ON CONFLICT(expense_id) DO UPDATE SET
                    stored_name = excluded.stored_name,
                    original_name = excluded.original_name,
                    mime_type = excluded.mime_type,
                    size_bytes = excluded.size_bytes,
                    sha256 = excluded.sha256,
                    updated_at = excluded.updated_at",
                params![
                    id,
                    expense_id,
                    stored_name,
                    original_name,
                    mime_type,
                    bytes.len() as i64,
                    sha256,
                    now,
                ],
            )?;
            let receipt = conn.query_row(
                "SELECT id, expense_id, original_name, mime_type, size_bytes, sha256,
                        created_at, updated_at
                 FROM receipt_attachments WHERE expense_id = ?1",
                [expense_id],
                map_receipt_row,
            )?;
            Ok((receipt, old_name))
        });

        match result {
            Ok((receipt, old_name)) => {
                if let Some(old_name) = old_name {
                    if old_name != stored_name {
                        self.remove_receipt_file(&old_name)?;
                    }
                }
                Ok(receipt)
            }
            Err(error) => {
                let _ = std::fs::remove_file(destination);
                Err(error)
            }
        }
    }

    pub fn receipt_preview_data_url(&self, expense_id: &str) -> AppResult<Option<String>> {
        let stored = self.with_conn(|conn| {
            conn.query_row(
                "SELECT stored_name, mime_type FROM receipt_attachments WHERE expense_id = ?1",
                [expense_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(Into::into)
        })?;
        let Some((stored_name, mime_type)) = stored else {
            return Ok(None);
        };
        let bytes = std::fs::read(self.receipt_path(&stored_name)?)?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        Ok(Some(format!("data:{mime_type};base64,{encoded}")))
    }

    pub fn remove_receipt(&self, expense_id: &str) -> AppResult<()> {
        let stored_name = self.with_conn(|conn| {
            let stored_name: Option<String> = conn
                .query_row(
                    "SELECT stored_name FROM receipt_attachments WHERE expense_id = ?1",
                    [expense_id],
                    |row| row.get(0),
                )
                .optional()?;
            conn.execute(
                "DELETE FROM receipt_attachments WHERE expense_id = ?1",
                [expense_id],
            )?;
            Ok(stored_name)
        })?;
        if let Some(stored_name) = stored_name {
            self.remove_receipt_file(&stored_name)?;
        }
        Ok(())
    }

    pub(crate) fn receipts_dir(&self) -> PathBuf {
        self.data_dir.join("receipts")
    }

    pub(crate) fn data_dir(&self) -> &std::path::Path {
        &self.data_dir
    }

    pub(crate) fn db_path(&self) -> &std::path::Path {
        &self.db_path
    }

    pub(crate) fn snapshot_to(&self, destination: &std::path::Path) -> AppResult<()> {
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)?;
        }
        if destination.exists() {
            std::fs::remove_file(destination)?;
        }
        self.with_conn(|source| {
            let mut target = Connection::open(destination)?;
            let backup = rusqlite::backup::Backup::new(source, &mut target)?;
            backup.run_to_completion(10, std::time::Duration::from_millis(10), None)?;
            Ok(())
        })
    }

    pub(crate) fn restore_from_snapshot(&self, source_path: &std::path::Path) -> AppResult<()> {
        let source = Connection::open(source_path)?;
        let mut live = self
            .conn
            .lock()
            .map_err(|_| AppError::Message("DB lock poisoned".into()))?;
        let backup = rusqlite::backup::Backup::new(&source, &mut live)?;
        backup.run_to_completion(10, std::time::Duration::from_millis(10), None)?;
        drop(backup);
        live.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(())
    }

    fn receipt_path(&self, stored_name: &str) -> AppResult<PathBuf> {
        if stored_name.is_empty()
            || stored_name.contains('/')
            || stored_name.contains('\\')
            || stored_name.contains("..")
        {
            return Err(AppError::Message("Invalid stored receipt path.".into()));
        }
        Ok(self.receipts_dir().join(stored_name))
    }

    fn remove_receipt_file(&self, stored_name: &str) -> AppResult<()> {
        let path = self.receipt_path(stored_name)?;
        match std::fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        }
    }

    pub fn purge_expired_trash(&self, days: i64) -> AppResult<()> {
        let cutoff = (chrono::Utc::now() - chrono::Duration::days(days))
            .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        let (receipt_names, category_ids) = self.with_conn(|conn| {
            let mut receipt_stmt = conn.prepare(
                "SELECT r.stored_name
                 FROM receipt_attachments r
                 JOIN expenses e ON e.id = r.expense_id
                 WHERE e.deleted_at IS NOT NULL AND e.deleted_at < ?1",
            )?;
            let receipt_names = receipt_stmt
                .query_map([&cutoff], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            drop(receipt_stmt);

            let mut category_stmt = conn.prepare(
                "SELECT id FROM categories
                 WHERE id <> '__uncategorized__'
                   AND deleted_at IS NOT NULL AND deleted_at < ?1",
            )?;
            let category_ids = category_stmt
                .query_map([&cutoff], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            drop(category_stmt);

            let tx = conn.unchecked_transaction()?;
            for id in &category_ids {
                tx.execute(
                    "UPDATE expenses SET category_id = '__uncategorized__', updated_at = ?2
                     WHERE category_id = ?1",
                    params![id, now_iso()],
                )?;
                tx.execute(
                    "UPDATE recurring_rules SET category_id = '__uncategorized__', updated_at = ?2
                     WHERE category_id = ?1",
                    params![id, now_iso()],
                )?;
                tx.execute("DELETE FROM budgets WHERE category_id = ?1", [id])?;
                tx.execute("DELETE FROM category_budgets WHERE category_id = ?1", [id])?;
                tx.execute("DELETE FROM categories WHERE id = ?1", [id])?;
            }
            tx.execute(
                "DELETE FROM budgets WHERE deleted_at IS NOT NULL AND deleted_at < ?1",
                [&cutoff],
            )?;
            tx.execute(
                "DELETE FROM expenses WHERE deleted_at IS NOT NULL AND deleted_at < ?1",
                [&cutoff],
            )?;
            tx.commit()?;
            Ok((receipt_names, category_ids))
        })?;

        for name in receipt_names {
            self.remove_receipt_file(&name)?;
        }
        let _ = category_ids;
        Ok(())
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
        validate_currency(&input.from_code)?;
        validate_currency(&input.to_code)?;
        validate_date(&input.as_of_date, "FX rate date")?;
        if input.from_code == input.to_code || !input.rate.is_finite() || input.rate <= 0.0 {
            return Err(AppError::Message(
                "Choose different currencies and enter a positive finite rate.".into(),
            ));
        }
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
        if !(1..=2).contains(&payload.version) {
            return Err(AppError::Message(format!(
                "Unsupported legacy backup version {}.",
                payload.version
            )));
        }
        if payload.categories.is_empty() {
            return Err(AppError::Message(
                "A backup must contain at least one category.".into(),
            ));
        }
        let mut category_ids = std::collections::HashSet::new();
        for category in &payload.categories {
            validate_category_values(&category.name, &category.color, &category.icon)?;
            if !category_ids.insert(category.id.as_str()) {
                return Err(AppError::Message(
                    "Backup contains duplicate category IDs.".into(),
                ));
            }
        }
        for expense in &payload.expenses {
            validate_expense_input(&NewExpenseInput {
                amount_minor: expense.amount_minor,
                currency_code: expense.currency_code.clone(),
                category_id: expense.category_id.clone(),
                date: expense.date.clone(),
                note: expense.note.clone(),
                payment_method: expense.payment_method.clone(),
                tags: expense.tags.clone(),
            })?;
        }
        if payload.budgets.total_monthly_minor <= 0 {
            return Err(AppError::Message(
                "Backup contains an invalid overall budget.".into(),
            ));
        }

        let old_receipts = self.with_conn(|conn| {
            let mut receipt_stmt =
                conn.prepare("SELECT stored_name FROM receipt_attachments")?;
            let old_receipts = receipt_stmt
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            drop(receipt_stmt);

            conn.execute_batch("BEGIN IMMEDIATE;")?;
            let result: AppResult<()> = (|| {
                conn.execute("DELETE FROM expenses", [])?;
                conn.execute("DELETE FROM category_budgets", [])?;
                conn.execute("DELETE FROM budgets", [])?;
                conn.execute("DELETE FROM fx_rates", [])?;

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
                    )
                    .or_else(|error| {
                        if matches!(error, rusqlite::Error::SqliteFailure(_, _)) {
                            conn.execute(
                                "UPDATE categories SET name=?2, color=?3, icon=?4, is_active=?5,
                                 created_at=?6, updated_at=?7, deleted_at=?8 WHERE id=?1",
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
                            )
                        } else {
                            Err(error)
                        }
                    })?;
                }
                conn.execute(
                    "INSERT OR IGNORE INTO categories (
                        id, name, color, icon, is_active, created_at, updated_at, deleted_at
                     ) VALUES (
                        '__uncategorized__', 'Uncategorized', '#737373', 'more-horizontal',
                        1, ?1, ?1, NULL
                     )",
                    [now_iso()],
                )?;

                for e in &payload.expenses {
                    ensure_category_exists(conn, &e.category_id)?;
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
                let base_currency = payload
                    .settings
                    .get("baseCurrency")
                    .and_then(|value| value.as_str())
                    .filter(|code| validate_currency(code).is_ok())
                    .unwrap_or("USD");
                let now = now_iso();
                conn.execute(
                    "INSERT INTO budgets (
                        id, category_id, limit_amount_minor, currency_code, period_type,
                        created_at, updated_at, deleted_at
                     ) VALUES (
                        'budget-overall-monthly', NULL, ?1, ?2, 'monthly', ?3, ?3, NULL
                     )",
                    params![payload.budgets.total_monthly_minor, base_currency, now],
                )?;
                for b in &payload.budgets.items {
                    if b.limit_minor <= 0 {
                        return Err(AppError::Message(
                            "Backup contains an invalid category budget.".into(),
                        ));
                    }
                    ensure_category_exists(conn, &b.category_id)?;
                    conn.execute(
                        "INSERT INTO category_budgets (category_id, limit_minor) VALUES (?1, ?2)",
                        params![b.category_id, b.limit_minor],
                    )?;
                    conn.execute(
                        "INSERT INTO budgets (
                            id, category_id, limit_amount_minor, currency_code, period_type,
                            created_at, updated_at, deleted_at
                         ) VALUES (?1, ?2, ?3, ?4, 'monthly', ?5, ?5, NULL)",
                        params![
                            format!("budget-category-{}", b.category_id),
                            b.category_id,
                            b.limit_minor,
                            base_currency,
                            now,
                        ],
                    )?;
                }

                if let Some(rates) = &payload.fx_rates {
                    let now = now_iso();
                    for r in rates {
                        validate_currency(&r.from_code)?;
                        validate_currency(&r.to_code)?;
                        validate_date(&r.as_of_date, "FX rate date")?;
                        if !r.rate.is_finite() || r.rate <= 0.0 || r.from_code == r.to_code {
                            return Err(AppError::Message(
                                "Backup contains an invalid FX rate.".into(),
                            ));
                        }
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
            Ok(old_receipts)
        })?;
        for name in old_receipts {
            self.remove_receipt_file(&name)?;
        }
        Ok(())
    }

    pub fn seed_if_empty(&self) -> AppResult<bool> {
        let counts = self.counts()?;
        if counts.expenses > 0 || counts.categories > 0 {
            return Ok(false);
        }
        Ok(true)
    }

    pub fn save_backup_file(
        &self,
        dir: &str,
        content: &str,
        file_extension: &str,
    ) -> AppResult<String> {
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
            let mut stmt =
                conn.prepare("SELECT value FROM app_settings WHERE key = 'ui_settings'")?;
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

fn current_base_currency(conn: &Connection) -> String {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'ui_settings'",
            [],
            |row| row.get(0),
        )
        .optional()
        .unwrap_or(None);
    raw.and_then(|value| serde_json::from_str::<serde_json::Value>(&value).ok())
        .and_then(|value| {
            value
                .get("baseCurrency")
                .and_then(|code| code.as_str())
                .map(str::to_string)
        })
        .filter(|code| validate_currency(code).is_ok())
        .unwrap_or_else(|| "USD".to_string())
}

fn detect_receipt_type(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some(("image/jpeg", "jpg"));
    }
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some(("image/png", "png"));
    }
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some(("image/webp", "webp"));
    }
    None
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

fn map_budget_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Budget> {
    Ok(Budget {
        id: row.get(0)?,
        category_id: row.get(1)?,
        limit_amount_minor: row.get(2)?,
        currency_code: row.get(3)?,
        period_type: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        deleted_at: row.get(7)?,
    })
}

fn map_receipt_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReceiptAttachment> {
    Ok(ReceiptAttachment {
        id: row.get(0)?,
        expense_id: row.get(1)?,
        original_name: row.get(2)?,
        mime_type: row.get(3)?,
        size_bytes: row.get(4)?,
        sha256: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
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
