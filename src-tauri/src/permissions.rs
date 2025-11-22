use std::path::Path;
use std::process::Command;
use tauri::api::dialog;
use tauri::{Runtime, Manager};

#[tauri::command]
pub async fn request_disk_access() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        // Check if we have full disk access
        match check_full_disk_access() {
            Ok(true) => return Ok(true),
            Ok(false) => {},
            Err(e) => return Err(e),
        }

        // Request access by opening system preferences
        let message = "Maka needs Full Disk Access to scan your files. Please:\n\n1. Click 'Open System Preferences'\n2. Click the lock and enter your password\n3. Check the box next to Maka\n4. Restart the app";

        dialog::ask(
            None as Option<&tauri::Window<tauri::Wry>>,
            "Disk Access Required",
            message,
            move |answer| {
                if answer {
                    // Open System Preferences > Security & Privacy > Privacy > Full Disk Access
                    let _ = Command::new("open")
                        .args(&["x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"])
                        .spawn();
                }
            }
        );

        Ok(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true) // Assume access on non-macOS systems
    }
}

#[cfg(target_os = "macos")]
fn check_full_disk_access() -> Result<bool, String> {
    use std::fs;

    // Try to access a protected directory
    let test_paths = vec![
        "/Library/Application Support/com.apple.TCC",
        "/Users",
        "/System",
    ];

    for path in test_paths {
        match fs::metadata(path) {
            Ok(_) => return Ok(true),
            Err(e) => {
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    continue;
                }
            }
        }
    }

    Ok(false)
}

#[tauri::command]
pub async fn check_permissions<R: Runtime>(app_handle: tauri::AppHandle<R>, path: String) -> Result<bool, String> {
    let path = Path::new(&path);
    let path_display = path.display().to_string();

    // Check if we can read the directory
    if path.is_dir() {
        match path.read_dir() {
            Ok(_) => Ok(true),
            Err(e) => {
                // Show permission dialog
                if let Some(window) = app_handle.get_window("main") {
                    let error_msg = format!("Cannot access {}: {}. Would you like to grant access?", path_display, e);
                    let path_clone = path_display.clone();

                    dialog::ask(
                        Some(&window),
                        "Permission Required",
                        error_msg,
                        move |answer| {
                            if answer {
                                // Try to open the directory in Finder to trigger macOS permission dialog
                                let _ = std::process::Command::new("open")
                                    .arg(&path_clone)
                                    .output();
                            }
                        }
                    );
                }
                Err(format!("Permission denied: {}", e))
            }
        }
    } else {
        Ok(true)
    }
}
