// Rust structs mirroring the TypeScript data model (spec section 11).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Expense {
    pub id: String,
    pub amount_minor: i64,
    pub currency_code: String,
    pub category_id: String,
    pub date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    pub is_recurring: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recurrence_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewExpenseInput {
    pub amount_minor: i64,
    pub currency_code: String,
    pub category_id: String,
    pub date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewCategoryInput {
    pub name: String,
    pub color: String,
    pub icon: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryBudgetRow {
    pub category_id: String,
    pub limit_minor: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetsSnapshot {
    pub total_monthly_minor: i64,
    pub items: Vec<CategoryBudgetRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FxRate {
    pub id: String,
    pub from_code: String,
    pub to_code: String,
    pub rate: f64,
    pub as_of_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewFxRateInput {
    pub from_code: String,
    pub to_code: String,
    pub rate: f64,
    pub as_of_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecurringRule {
    pub id: String,
    pub title: String,
    pub amount_minor: i64,
    pub currency_code: String,
    pub category_id: String,
    pub frequency: String,
    pub start_date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_date: Option<String>,
    pub is_active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_generated_date: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewRecurringRuleInput {
    pub title: String,
    pub amount_minor: i64,
    pub currency_code: String,
    pub category_id: String,
    pub frequency: String,
    pub start_date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppBackupPayload {
    pub version: i32,
    pub exported_at: String,
    pub expenses: Vec<Expense>,
    pub categories: Vec<Category>,
    pub budgets: BudgetsSnapshot,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fx_rates: Option<Vec<FxRate>>,
    pub settings: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbCounts {
    pub expenses: i64,
    pub categories: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaterializeRecurringResult {
    pub created: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupFileInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub modified_at: String,
    pub encrypted: bool,
}
