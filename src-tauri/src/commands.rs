// Tauri commands exposed to the frontend.

use tauri::State;

use crate::db::AppDb;
use crate::error::AppResult;
use crate::models::{
    AppBackupPayload, BackupFileInfo, BudgetsSnapshot, Category, DbCounts, Expense, FxRate,
    GetInsightsInput, Insight, MaterializeRecurringResult, NewCategoryInput, NewExpenseInput,
    NewFxRateInput, NewRecurringRuleInput, ReceiptAttachment, RecurringRule, TrashSnapshot,
};

#[tauri::command]
pub fn db_counts(db: State<'_, AppDb>) -> AppResult<DbCounts> {
    db.counts()
}

#[tauri::command]
pub fn list_expenses(db: State<'_, AppDb>) -> AppResult<Vec<Expense>> {
    db.list_expenses()
}

#[tauri::command]
pub fn create_expense(db: State<'_, AppDb>, input: NewExpenseInput) -> AppResult<Expense> {
    db.create_expense(input)
}

#[tauri::command]
pub fn update_expense(
    db: State<'_, AppDb>,
    id: String,
    input: NewExpenseInput,
) -> AppResult<Expense> {
    db.update_expense(&id, input)
}

#[tauri::command]
pub fn soft_delete_expense(db: State<'_, AppDb>, id: String) -> AppResult<()> {
    db.soft_delete_expense(&id)
}

#[tauri::command]
pub fn restore_expense(db: State<'_, AppDb>, id: String) -> AppResult<()> {
    db.restore_expense(&id)
}

#[tauri::command]
pub fn permanent_delete_expense(db: State<'_, AppDb>, id: String) -> AppResult<()> {
    db.permanent_delete_expense(&id)
}

#[tauri::command]
pub fn empty_trash(db: State<'_, AppDb>) -> AppResult<()> {
    db.empty_trash()
}

#[tauri::command]
pub fn list_trash(db: State<'_, AppDb>) -> AppResult<TrashSnapshot> {
    db.list_trash()
}

#[tauri::command]
pub fn list_categories(db: State<'_, AppDb>) -> AppResult<Vec<Category>> {
    db.list_categories()
}

#[tauri::command]
pub fn create_category(db: State<'_, AppDb>, input: NewCategoryInput) -> AppResult<Category> {
    db.create_category(input)
}

#[tauri::command]
pub fn update_category(
    db: State<'_, AppDb>,
    id: String,
    name: String,
    color: String,
    icon: String,
    is_active: bool,
) -> AppResult<Category> {
    db.update_category(&id, &name, &color, &icon, is_active)
}

#[tauri::command]
pub fn delete_category(db: State<'_, AppDb>, id: String) -> AppResult<()> {
    db.delete_category(&id)
}

#[tauri::command]
pub fn restore_category(db: State<'_, AppDb>, id: String) -> AppResult<()> {
    db.restore_category(&id)
}

#[tauri::command]
pub fn permanent_delete_category(db: State<'_, AppDb>, id: String) -> AppResult<()> {
    db.permanent_delete_category(&id)
}

#[tauri::command]
pub fn get_budgets(db: State<'_, AppDb>) -> AppResult<BudgetsSnapshot> {
    db.get_budgets()
}

#[tauri::command]
pub fn set_budgets(db: State<'_, AppDb>, snapshot: BudgetsSnapshot) -> AppResult<()> {
    db.set_budgets(&snapshot)
}

#[tauri::command]
pub fn restore_budget(db: State<'_, AppDb>, id: String) -> AppResult<()> {
    db.restore_budget(&id)
}

#[tauri::command]
pub fn permanent_delete_budget(db: State<'_, AppDb>, id: String) -> AppResult<()> {
    db.permanent_delete_budget(&id)
}

#[tauri::command]
pub fn list_fx_rates(db: State<'_, AppDb>) -> AppResult<Vec<FxRate>> {
    db.list_fx_rates()
}

#[tauri::command]
pub fn upsert_fx_rate(db: State<'_, AppDb>, input: NewFxRateInput) -> AppResult<FxRate> {
    db.upsert_fx_rate(input)
}

#[tauri::command]
pub fn remove_fx_rate(db: State<'_, AppDb>, id: String) -> AppResult<()> {
    db.remove_fx_rate(&id)
}

#[tauri::command]
pub fn replace_fx_rates(db: State<'_, AppDb>, rates: Vec<FxRate>) -> AppResult<()> {
    db.replace_fx_rates(&rates)
}

#[tauri::command]
pub fn list_recurring_rules(db: State<'_, AppDb>) -> AppResult<Vec<RecurringRule>> {
    db.list_recurring_rules()
}

#[tauri::command]
pub fn create_recurring_rule(
    db: State<'_, AppDb>,
    input: NewRecurringRuleInput,
) -> AppResult<RecurringRule> {
    db.create_recurring_rule(input)
}

#[tauri::command]
pub fn delete_recurring_rule(db: State<'_, AppDb>, id: String) -> AppResult<()> {
    db.delete_recurring_rule(&id)
}

#[tauri::command]
pub fn materialize_recurring_due(db: State<'_, AppDb>) -> AppResult<MaterializeRecurringResult> {
    db.materialize_recurring_due()
}

#[tauri::command]
pub fn import_backup(db: State<'_, AppDb>, payload: AppBackupPayload) -> AppResult<()> {
    db.import_backup(&payload)
}

#[tauri::command]
pub fn save_backup_to_disk(
    db: State<'_, AppDb>,
    backup_path: String,
    json: String,
    file_extension: Option<String>,
) -> AppResult<String> {
    let ext = file_extension.unwrap_or_else(|| "json".to_string());
    db.save_backup_file(&backup_path, &json, &ext)
}

#[tauri::command]
pub fn list_backups(db: State<'_, AppDb>, backup_path: String) -> AppResult<Vec<BackupFileInfo>> {
    db.list_backups(&backup_path)
}

#[tauri::command]
pub fn read_backup_file(db: State<'_, AppDb>, file_path: String) -> AppResult<String> {
    db.read_backup_file(&file_path)
}

#[tauri::command]
pub fn get_ui_settings(db: State<'_, AppDb>) -> AppResult<Option<serde_json::Value>> {
    db.get_ui_settings()
}

#[tauri::command]
pub fn set_ui_settings(db: State<'_, AppDb>, settings: serde_json::Value) -> AppResult<()> {
    db.set_ui_settings(&settings)
}

#[tauri::command]
pub fn get_insights(db: State<'_, AppDb>, input: GetInsightsInput) -> AppResult<Vec<Insight>> {
    db.get_insights(input)
}

#[tauri::command]
pub fn get_receipt(
    db: State<'_, AppDb>,
    expense_id: String,
) -> AppResult<Option<ReceiptAttachment>> {
    db.get_receipt(&expense_id)
}

#[tauri::command]
pub fn attach_receipt(
    db: State<'_, AppDb>,
    expense_id: String,
    source_path: String,
) -> AppResult<ReceiptAttachment> {
    db.attach_receipt(&expense_id, &source_path)
}

#[tauri::command]
pub fn receipt_preview_data_url(
    db: State<'_, AppDb>,
    expense_id: String,
) -> AppResult<Option<String>> {
    db.receipt_preview_data_url(&expense_id)
}

#[tauri::command]
pub fn remove_receipt(db: State<'_, AppDb>, expense_id: String) -> AppResult<()> {
    db.remove_receipt(&expense_id)
}
