use std::process::Command;

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
        Ok(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true) // Assume access on non-macOS systems
    }
}

#[tauri::command]
pub async fn open_privacy_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open")
            .args(&["x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
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

    // We only check the TCC database directory which is the most reliable indicator
    // for Full Disk Access on modern macOS
    let path = "/Library/Application Support/com.apple.TCC";

    match fs::metadata(path) {
        Ok(_) => Ok(true),
        Err(e) => {
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                Ok(false)
            } else {
                // If it's another error (like NotFound), we might be on an older OS or weird state
                // but usually this means we can't verify, so we assume false or let it pass?
                // Safest is to return false if we can't verify.
                Ok(false)
            }
        }
    }
}
