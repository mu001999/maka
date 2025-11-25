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
        .invoke_handler(tauri::generate_handler![
            get_system_drives,
            permissions::request_disk_access,
            permissions::open_privacy_settings,
            permissions::select_directory,
            disk_ops::delete_items,
            build_cache,
            get_result_with_depth,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
