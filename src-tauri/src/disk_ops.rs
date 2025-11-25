use std::fs;
use std::path::Path;

#[tauri::command]
pub async fn delete_items(paths: Vec<String>) -> Result<(), String> {
    for path_str in paths {
        let path = Path::new(&path_str);
        if path.exists() {
            if path.is_dir() {
                fs::remove_dir_all(path)
                    .map_err(|e| format!("Failed to delete directory {}: {}", path_str, e))?;
            } else {
                fs::remove_file(path)
                    .map_err(|e| format!("Failed to delete file {}: {}", path_str, e))?;
            }
        }
    }
    Ok(())
}
