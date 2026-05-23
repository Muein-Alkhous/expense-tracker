// Library crate root: assembles the Tauri builder and re-exports modules.

mod backup;
mod commands;
mod db;
mod error;
mod insights;
mod models;

use db::AppDb;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
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
            commands::list_categories,
            commands::create_category,
            commands::update_category,
            commands::delete_category,
            commands::get_budgets,
            commands::set_budgets,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
