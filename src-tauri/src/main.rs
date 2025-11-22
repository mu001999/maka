#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod disk_scanner;
mod permissions;

#[cfg(test)]
mod disk_scanner_tests;

use disk_scanner::{
    build_directory_cache, get_directory_children, get_directory_children_with_depth,
    get_directory_info, get_error_stats, get_system_drives, reset_error_stats, scan_directory,
};
use permissions::{check_permissions, request_disk_access, select_directory};

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            get_system_drives,
            request_disk_access,
            check_permissions,
            select_directory,
            build_directory_cache,
            get_directory_info,
            get_directory_children,
            get_directory_children_with_depth,
            get_error_stats,
            reset_error_stats
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
