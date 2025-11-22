#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod disk_scanner;
mod permissions;

use disk_scanner::{scan_directory, get_system_drives, build_directory_cache, get_directory_info, get_directory_children};
use permissions::{request_disk_access, check_permissions};

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            get_system_drives,
            request_disk_access,
            check_permissions,
            build_directory_cache,
            get_directory_info,
            get_directory_children
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
