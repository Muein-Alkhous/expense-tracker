// Tauri entry point: builds the app, registers plugins, and exposes commands.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    expense_tracker_lib::run();
}
