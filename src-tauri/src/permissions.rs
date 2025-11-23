use std::process::Command;
use tauri::api::dialog;

#[tauri::command]
pub async fn request_disk_access() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        // Check if we have full disk access
        match check_full_disk_access() {
            Ok(true) => return Ok(true),
            Ok(false) => {}
            Err(e) => return Err(e),
        }

        // Request access by opening system preferences
        let message = "Maka needs Full Disk Access to scan your files.\n\nSome directories may not be accessible without this permission.\n\nPlease:\n1. Click 'Open System Preferences'\n2. Click the lock and enter your password\n3. Check the box next to Maka\n4. Restart the app";

        dialog::ask(
            None as Option<&tauri::Window<tauri::Wry>>,
            "Full Disk Access Required",
            message,
            move |answer| {
                if answer {
                    // Open System Preferences > Security & Privacy > Privacy > Full Disk Access
                    let _ = Command::new("open")
                        .args(&["x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"])
                        .spawn();
                }
            },
        );

        Ok(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true) // Assume access on non-macOS systems
    }
}

#[tauri::command]
pub async fn select_directory(_window: tauri::Window) -> Result<Option<String>, String> {
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};
    use tauri::api::dialog::FileDialogBuilder;

    let result = Arc::new(Mutex::new(None));
    let result_clone = result.clone();

    // Use the async dialog API
    FileDialogBuilder::new()
        .set_title("Select a Directory to Scan")
        .set_directory("/")
        .pick_folder(move |path| {
            let path_str = path.map(|p| p.to_string_lossy().to_string());
            println!("=== [Backend] Directory selection result: {:?}", path_str);
            *result_clone.lock().unwrap() = path_str;
        });

    // Wait for the dialog to complete (with timeout)
    let start = Instant::now();
    while start.elapsed().as_secs() < 60 {
        // 60 second timeout
        std::thread::sleep(Duration::from_millis(100));
        let result_guard = result.lock().unwrap();
        if result_guard.is_some() {
            return Ok(result_guard.clone());
        }
        drop(result_guard);
    }

    Ok(None)
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
