use tauri_plugin_dialog::{DialogExt, FilePath};

#[tauri::command]
pub async fn select_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
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
