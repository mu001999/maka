#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod disk_scanner;
mod permissions;

#[cfg(test)]
mod disk_scanner_tests;

use disk_scanner::{
    build_directory_cache, get_directory_children_with_depth, get_error_stats, get_system_drives,
    reset_error_stats,
};

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_system_drives,
            permissions::request_disk_access,
            permissions::select_directory,
            build_directory_cache,
            get_directory_children_with_depth,
            get_error_stats,
            reset_error_stats
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
