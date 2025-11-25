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
pub async fn select_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::{DialogExt, FilePath};

    let file_path = app
        .dialog()
        .file()
        .set_title("Select a Directory to Scan")
        .set_directory("/")
        .blocking_pick_folder();

    Ok(file_path.map(|p| match p {
        FilePath::Path(path_buf) => path_buf.to_string_lossy().to_string(),
        FilePath::Url(url) => url.to_string(),
    }))
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
