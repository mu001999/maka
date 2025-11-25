#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod disk_ops;
mod disk_scanner;
mod permissions;

use disk_scanner::{build_cache, get_result_with_depth, get_system_drives};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_macos_permissions::init())
        .invoke_handler(tauri::generate_handler![
            get_system_drives,
            permissions::select_directory,
            disk_ops::delete_items,
            build_cache,
            get_result_with_depth,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
