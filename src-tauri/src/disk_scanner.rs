use std::fs;
use std::path::Path;

use dashmap::DashMap;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

static SCANNER: std::sync::LazyLock<DiskScanner> = std::sync::LazyLock::new(|| DiskScanner::new());

#[derive(Debug, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_directory: bool,
    pub children: Vec<FileNode>,
    pub children_count: usize,
    pub show: bool,
}

impl FileNode {
    pub fn limit_depth(&self, max_depth: u32) -> Self {
        let mut filtered_node = Self {
            name: self.name.clone(),
            path: self.path.clone(),
            size: self.size,
            is_directory: self.is_directory,
            children: Vec::new(),
            children_count: self.children_count,
            show: self.show,
        };

        if max_depth == 0 {
            filtered_node.show = false;
            return filtered_node;
        }

        for child in &self.children {
            filtered_node
                .children
                .push(child.limit_depth(max_depth - 1));
        }
        filtered_node
    }
}

pub struct DiskScanner {
    // Cache root file nodes in memory
    cache: DashMap<String, FileNode>,
}

impl DiskScanner {
    pub fn new() -> Self {
        Self {
            cache: DashMap::new(),
        }
    }

    pub fn build_cache(&self, path: &str) -> Result<(), String> {
        let root_node = self.scan_file_or_directory(Path::new(path))?;
        self.cache.insert(path.to_string(), root_node);
        Ok(())
    }

    fn scan_file_or_directory(&self, path: &Path) -> Result<FileNode, String> {
        let path = Path::new(path);
        if !path.exists() {
            return Err("Path does not exist".to_string());
        }

        let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
        if metadata.is_dir() {
            let entries = match fs::read_dir(path) {
                Ok(entries) => entries,
                Err(e) => {
                    return Err(e.to_string());
                }
            };

            // Skip /Volumes and /System/Volumes on macOS
            #[cfg(target_os = "macos")]
            if path.to_string_lossy() == "/Volumes" || path.to_string_lossy() == "/System/Volumes" {
                return Ok(FileNode {
                    name: path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                    path: path.to_string_lossy().to_string(),
                    size: 0,
                    is_directory: true,
                    children: vec![],
                    children_count: 0,
                    show: true,
                });
            }

            // Skip /proc, /sys, /dev on Linux
            #[cfg(target_os = "linux")]
            {
                let path_str = path.to_string_lossy();
                if path_str == "/proc" || path_str == "/sys" || path_str == "/dev" {
                    return Ok(FileNode {
                        name: path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string(),
                        path: path_str.to_string(),
                        size: 0,
                        is_directory: true,
                        children: vec![],
                        children_count: 0,
                        show: true,
                    });
                }
            }

            // Use rayon for parallel processing of directory entries
            let mut children: Vec<FileNode> = entries
                .par_bridge() // Convert to parallel iterator
                .filter_map(|entry| entry.ok())
                .filter_map(|entry| {
                    let entry_path = entry.path();
                    match self.scan_file_or_directory(&entry_path) {
                        Ok(child_node) => Some(child_node),
                        Err(_) => None,
                    }
                })
                .collect();

            // Sort by size (largest first)
            children.sort_by(|a, b| b.size.cmp(&a.size));
            let size = children.iter().map(|c| c.size).sum();
            let children_count = children.len();

            Ok(FileNode {
                name: path
                    .file_name()
                    .map(|name| name.to_string_lossy().to_string())
                    .unwrap_or_else(|| "/".to_string()),
                path: path.to_string_lossy().to_string(),
                size: size,
                is_directory: true,
                children,
                children_count: children_count,
                show: true,
            })
        } else {
            Ok(FileNode {
                name: path
                    .file_name()
                    .expect("Failed to get file name")
                    .to_string_lossy()
                    .to_string(),
                path: path.to_string_lossy().to_string(),
                size: metadata.len(),
                is_directory: false,
                children: vec![],
                children_count: 0,
                show: true,
            })
        }
    }

    pub fn get_result_with_depth(&self, path: &str, max_depth: u32) -> Result<FileNode, String> {
        for root_node in self.cache.iter() {
            if path.starts_with(&root_node.path) {
                let relative_path = path.strip_prefix(&root_node.path).unwrap().to_string();
                let mut current_node = root_node.value();
                for part in relative_path.split('/').filter(|p| !p.is_empty()) {
                    if let Some(child) = current_node.children.iter().find(|c| c.name == part) {
                        current_node = child;
                    } else {
                        return Err("Path not found in cache".to_string());
                    }
                }

                return Ok(current_node.limit_depth(max_depth + 1));
            }
        }
        Err("Path not found in cache".to_string())
    }
}

// New Tauri commands for on-demand loading using rayon for parallel processing
#[tauri::command]
pub async fn build_cache(path: String) -> Result<(), String> {
    // Use rayon parallel processing to build cache
    rayon::scope(|_s| SCANNER.build_cache(&path))
}

#[tauri::command]
pub async fn get_result_with_depth(path: String, max_depth: u32) -> Result<FileNode, String> {
    if let Ok(node) = SCANNER.get_result_with_depth(&path, max_depth) {
        Ok(node)
    } else {
        // Let us try again
        build_cache(path.clone()).await?;
        SCANNER.get_result_with_depth(&path, max_depth)
    }
}

#[tauri::command]
pub async fn get_system_drives() -> Result<Vec<String>, String> {
    println!("=== [Backend] Tauri command get_system_drives called");

    // Use rayon for parallel processing
    let result = rayon::scope(|_s| {
        #[cfg(target_os = "macos")]
        {
            let drives = vec!["/".to_string()];
            println!("=== [Backend] macOS system drives: {:?}", drives);
            Ok(drives)
        }
        #[cfg(target_os = "linux")]
        {
            use std::process::Command;

            println!("=== [Backend] Getting Linux system drives using df command");
            let output = Command::new("df")
                .args(&["-P", "-x", "tmpfs", "-x", "devtmpfs"])
                .output()
                .map_err(|e| e.to_string())?;

            let mut drives = Vec::new();
            for line in String::from_utf8_lossy(&output.stdout).lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 6 {
                    drives.push(parts[5].to_string());
                }
            }
            println!("=== [Backend] Linux system drives: {:?}", drives);
            Ok(drives)
        }
        #[cfg(target_os = "windows")]
        {
            let drives = vec!["C:\\".to_string()];
            println!("=== [Backend] Windows system drives: {:?}", drives);
            Ok(drives)
        }
    });

    result
}
