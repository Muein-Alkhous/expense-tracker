// Library crate root: assembles the Tauri builder and re-exports modules.

mod backup;
mod commands;
mod db;
mod error;
mod fx_convert;
mod insights;
mod models;

use db::AppDb;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let db = AppDb::open(&app.handle())?;
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::db_counts,
            commands::list_expenses,
            commands::create_expense,
            commands::update_expense,
            commands::soft_delete_expense,
            commands::restore_expense,
            commands::permanent_delete_expense,
            commands::empty_trash,
            commands::list_trash,
            commands::list_categories,
            commands::create_category,
            commands::update_category,
            commands::delete_category,
            commands::restore_category,
            commands::permanent_delete_category,
            commands::get_budgets,
            commands::set_budgets,
            commands::restore_budget,
            commands::permanent_delete_budget,
            commands::list_fx_rates,
            commands::upsert_fx_rate,
            commands::remove_fx_rate,
            commands::replace_fx_rates,
            commands::list_recurring_rules,
            commands::create_recurring_rule,
            commands::delete_recurring_rule,
            commands::materialize_recurring_due,
            commands::import_backup,
            commands::save_backup_to_disk,
            commands::list_backups,
            commands::read_backup_file,
            commands::get_ui_settings,
            commands::set_ui_settings,
            commands::get_insights,
            commands::get_receipt,
            commands::attach_receipt,
            commands::receipt_preview_data_url,
            commands::remove_receipt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
