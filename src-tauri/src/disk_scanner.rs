use std::collections::HashMap;
use std::fs;
use std::os::unix::fs::MetadataExt;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::sync::RwLock;
use std::time::Instant;

use dashmap::DashMap;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_directory: bool,
    pub children: Vec<FileNode>,
    pub inode: Option<u64>,
    pub children_count: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_directory: bool,
    pub children_count: usize,
    pub children_names: Vec<String>,
}

// Global cache for directory information
static DIRECTORY_CACHE: once_cell::sync::Lazy<RwLock<Option<HashMap<String, DirectoryInfo>>>> =
    once_cell::sync::Lazy::new(|| RwLock::new(None));

pub struct DiskScanner {
    seen_inodes: Arc<DashMap<(u64, u64), bool>>,
    max_depth: Option<usize>,
    cache: Arc<DashMap<String, DirectoryInfo>>,
    permission_errors: Arc<AtomicUsize>,
    not_found_errors: Arc<AtomicUsize>,
}

impl DiskScanner {
    pub fn new() -> Self {
        Self {
            seen_inodes: Arc::new(DashMap::new()),
            max_depth: None,
            cache: Arc::new(DashMap::new()),
            permission_errors: Arc::new(AtomicUsize::new(0)),
            not_found_errors: Arc::new(AtomicUsize::new(0)),
        }
    }

    pub fn with_max_depth(max_depth: usize) -> Self {
        Self {
            seen_inodes: Arc::new(DashMap::new()),
            max_depth: Some(max_depth),
            cache: Arc::new(DashMap::new()),
            permission_errors: Arc::new(AtomicUsize::new(0)),
            not_found_errors: Arc::new(AtomicUsize::new(0)),
        }
    }

    // 获取错误统计信息
    pub fn get_error_stats(&self) -> (usize, usize) {
        (
            self.permission_errors.load(Ordering::Relaxed),
            self.not_found_errors.load(Ordering::Relaxed),
        )
    }

    // 重置错误统计
    pub fn reset_error_stats(&self) {
        self.permission_errors.store(0, Ordering::Relaxed);
        self.not_found_errors.store(0, Ordering::Relaxed);
    }

    // Quick scan to build directory cache without deep recursion
    pub fn build_directory_cache(&mut self, path: &str) -> Result<String, String> {
        let path = Path::new(path);
        if !path.exists() {
            return Err("Path does not exist".to_string());
        }

        let start_time = Instant::now();

        // Clear existing cache
        self.cache.clear();
        self.seen_inodes.clear();

        // Build cache starting from root
        self.scan_directory_for_cache(path, 0)?;

        let scan_duration = start_time.elapsed();
        println!("Cache build completed in {:?}", scan_duration);

        // Store in global cache
        let cache_map: HashMap<String, DirectoryInfo> = self
            .cache
            .iter()
            .map(|entry| (entry.key().clone(), entry.value().clone()))
            .collect();

        // Update global cache using rayon for parallel processing
        if let Ok(mut global_cache) = DIRECTORY_CACHE.write() {
            *global_cache = Some(cache_map);
        }

        Ok("Cache built successfully".to_string())
    }

    fn scan_directory_for_cache(&mut self, path: &Path, depth: usize) -> Result<(), String> {
        let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let inode = self.get_inode(&metadata);

        // Check for hard links
        if let Some(inode_val) = inode {
            let key = (metadata.dev(), inode_val);
            if self.seen_inodes.contains_key(&key) {
                return Ok(());
            }
            self.seen_inodes.insert(key, true);
        }

        if metadata.is_dir() {
            // Check depth limit
            if let Some(max_depth) = self.max_depth {
                if depth >= max_depth {
                    return Ok(());
                }
            }

            self.scan_directory_contents_for_cache(path, name, depth)?;
        }

        Ok(())
    }

    fn scan_directory_contents_for_cache(
        &mut self,
        path: &Path,
        dir_name: String,
        depth: usize,
    ) -> Result<(), String> {
        let entries = match fs::read_dir(path) {
            Ok(entries) => entries,
            Err(_) => return Ok(()),
        };

        // Collect and filter entries
        let mut entry_list: Vec<_> = entries.filter_map(|entry| entry.ok()).collect();

        // Sort by name
        entry_list.sort_by_key(|entry| entry.file_name().to_string_lossy().to_lowercase());

        // Limit entries
        const MAX_ENTRIES_PER_DIR: usize = 100;
        if entry_list.len() > MAX_ENTRIES_PER_DIR {
            entry_list.truncate(MAX_ENTRIES_PER_DIR);
        }

        // Use rayon for parallel directory scanning and size calculation
        let scan_results: Vec<(String, u64)> = entry_list
            .par_iter()
            .filter_map(|entry| {
                let entry_path = entry.path();
                let entry_name = entry.file_name().to_string_lossy().to_string();

                if let Ok(metadata) = fs::metadata(&entry_path) {
                    if metadata.is_dir() {
                        // For directories, just get basic info without recursive scanning here
                        // to avoid mutable borrow issues
                        Some((entry_name, 0)) // Will be updated later
                    } else {
                        Some((entry_name, metadata.len()))
                    }
                } else {
                    None
                }
            })
            .collect();

        // Process directories sequentially to avoid mutable borrow issues
        for entry in &entry_list {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                // Recursively scan subdirectories for cache
                let _ = self.scan_directory_for_cache(&entry_path, depth + 1);
            }
        }

        // Aggregate results with updated directory sizes
        let mut total_size = 0u64;
        let mut children_names = Vec::new();
        let mut children_count = 0;

        for (name, initial_size) in scan_results {
            let entry_path = path.join(&name);
            let size = if entry_path.is_dir() {
                // Get cached size for subdirectory
                let subdir_path = entry_path.to_string_lossy().to_string();
                if let Some(cached_info) = self.cache.get(&subdir_path) {
                    cached_info.size
                } else {
                    initial_size
                }
            } else {
                initial_size
            };

            total_size += size;
            children_names.push(name);
            children_count += 1;
        }

        // Store directory info in cache
        let dir_info = DirectoryInfo {
            name: dir_name,
            path: path.to_string_lossy().to_string(),
            size: total_size,
            is_directory: true,
            children_count,
            children_names,
        };

        self.cache
            .insert(path.to_string_lossy().to_string(), dir_info);

        Ok(())
    }

    // Scan all depths to calculate total size for a directory
    fn scan_all_depths_for_size(&self, path: &Path) -> Result<u64, String> {
        let mut total_size = 0u64;

        match fs::read_dir(path) {
            Ok(entries) => {
                for entry in entries {
                    if let Ok(entry) = entry {
                        let name = entry.file_name();
                        let _name_str = name.to_string_lossy();

                        let entry_path = entry.path();
                        match fs::metadata(&entry_path) {
                            Ok(metadata) => {
                                if metadata.is_dir() {
                                    // 递归扫描子目录
                                    match self.scan_all_depths_for_size(&entry_path) {
                                        Ok(sub_size) => total_size += sub_size,
                                        Err(e) => {
                                            // 统计错误类型并静默处理
                                            if e.contains("Permission denied")
                                                || e.contains("Operation not permitted")
                                            {
                                                self.permission_errors
                                                    .fetch_add(1, Ordering::Relaxed);
                                            } else if e.contains("No such file")
                                                || e.contains("os error 2")
                                            {
                                                self.not_found_errors
                                                    .fetch_add(1, Ordering::Relaxed);
                                            }

                                            // 只在调试模式下显示
                                            if cfg!(debug_assertions) {
                                                eprintln!(
                                                    "Debug: Failed to scan subdirectory {}: {}",
                                                    entry_path.display(),
                                                    e
                                                );
                                            }
                                        }
                                    }
                                } else {
                                    // 累加文件大小
                                    total_size += metadata.len();
                                }
                            }
                            Err(e) => {
                                // 统计错误类型并静默处理
                                if e.to_string().contains("Permission denied")
                                    || e.to_string().contains("Operation not permitted")
                                {
                                    self.permission_errors.fetch_add(1, Ordering::Relaxed);
                                } else if e.to_string().contains("No such file")
                                    || e.to_string().contains("os error 2")
                                {
                                    self.not_found_errors.fetch_add(1, Ordering::Relaxed);
                                }

                                // 只在调试模式下显示
                                if cfg!(debug_assertions) {
                                    eprintln!(
                                        "Debug: Failed to get metadata for {}: {}",
                                        entry_path.display(),
                                        e
                                    );
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                return Err(format!(
                    "Failed to read directory {}: {}",
                    path.display(),
                    e
                ));
            }
        }

        Ok(total_size)
    }

    // Get directory children with specified depth - returns nested structure
    // 重要：扫描所有深度以正确计算目录大小，但只返回指定深度的子项
    pub fn get_directory_children_with_depth(
        &self,
        path: &str,
        max_depth: u32,
    ) -> Result<Vec<FileNode>, String> {
        // 只在调试模式下显示详细日志
        if cfg!(debug_assertions) {
            println!("=== [Backend] get_directory_children_with_depth called for path: {}, max_depth: {}", path, max_depth);
        }

        let path = Path::new(path);
        if !path.exists() {
            if cfg!(debug_assertions) {
                println!("=== [Backend] Path does not exist: {}", path.display());
            }
            return Err("Path does not exist".to_string());
        }

        if cfg!(debug_assertions) {
            println!(
                "=== [Backend] Reading directory with depth: {}",
                path.display()
            );
        }
        let entries = match fs::read_dir(path) {
            Ok(entries) => entries,
            Err(e) => {
                // 统计错误类型并静默处理
                if e.to_string().contains("Permission denied")
                    || e.to_string().contains("Operation not permitted")
                {
                    self.permission_errors.fetch_add(1, Ordering::Relaxed);
                } else if e.to_string().contains("No such file")
                    || e.to_string().contains("os error 2")
                {
                    self.not_found_errors.fetch_add(1, Ordering::Relaxed);
                }

                // 只在调试模式下显示
                if cfg!(debug_assertions) {
                    println!("=== [Backend] Failed to read directory: {}", e);
                }
                return Err(e.to_string());
            }
        };

        // Use rayon for parallel processing of directory entries
        let mut children: Vec<FileNode> = entries
            .par_bridge() // Convert to parallel iterator
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| {
                let entry_path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();

                // 只在调试模式下显示处理日志
                if cfg!(debug_assertions) {
                    println!("=== [Backend] Processing entry with depth: {}", name);
                }

                match fs::metadata(&entry_path) {
                    Ok(metadata) => {
                        if metadata.is_dir() {
                            // 对于目录，扫描所有深度以正确计算大小，但只返回请求深度的子项
                            let children = if max_depth > 1 {
                                match self.get_directory_children_with_depth(
                                    &entry_path.to_string_lossy().to_string(),
                                    max_depth - 1
                                ) {
                                    Ok(sub_children) => sub_children,
                                    Err(e) => {
                                        // 统计错误类型并静默处理
                                        if e.to_string().contains("Permission denied") || e.to_string().contains("Operation not permitted") {
                                            self.permission_errors.fetch_add(1, Ordering::Relaxed);
                                        } else if e.to_string().contains("No such file") || e.to_string().contains("os error 2") {
                                            self.not_found_errors.fetch_add(1, Ordering::Relaxed);
                                        }

                                        // 只在调试模式下显示
                                        if cfg!(debug_assertions) {
                                            println!("=== [Backend] Failed to get children for {}: {}", name, e);
                                        }
                                        vec![]
                                    }
                                }
                            } else {
                                // max_depth == 1，不返回子项，但仍需要计算完整大小
                                // 扫描所有深度来获取正确的大小，但不返回任何子项
                                match self.scan_all_depths_for_size(&entry_path) {
                                    Ok(total_size) => {
                                        if cfg!(debug_assertions) {
                                            println!("=== [Backend] Scanned all depths for {}: total size = {}", name, total_size);
                                        }
                                        // 返回空子项列表，因为前端只请求了当前深度
                                        vec![]
                                    }
                                    Err(e) => {
                                        // 统计错误类型并静默处理
                                        if e.to_string().contains("Permission denied") || e.to_string().contains("Operation not permitted") {
                                            self.permission_errors.fetch_add(1, Ordering::Relaxed);
                                        } else if e.to_string().contains("No such file") || e.to_string().contains("os error 2") {
                                            self.not_found_errors.fetch_add(1, Ordering::Relaxed);
                                        }

                                        if cfg!(debug_assertions) {
                                            println!("=== [Backend] Failed to scan all depths for {}: {}", name, e);
                                        }
                                        vec![]
                                    }
                                }
                            };

                            let total_size = if max_depth > 1 {
                                // 如果还有深度，使用递归结果
                                children.iter().map(|child| child.size).sum::<u64>()
                            } else {
                                // 如果max_depth == 1，扫描所有深度获取完整大小
                                match self.scan_all_depths_for_size(&entry_path) {
                                    Ok(size) => size,
                                    Err(_) => 0
                                }
                            };

                            // Get actual children count from cache if available
                            let actual_children_count = if let Some(ref cache_map) = *DIRECTORY_CACHE.read().unwrap() {
                                cache_map.get(&entry_path.to_string_lossy().to_string())
                                    .map(|info| info.children_count)
                            } else {
                                None
                            };

                            Some(FileNode {
                                name,
                                path: entry_path.to_string_lossy().to_string(),
                                size: total_size,
                                is_directory: true,
                                children, // 只包含请求深度的子项
                                inode: self.get_inode(&metadata),
                                children_count: actual_children_count,
                            })
                        } else {
                            let file_size = metadata.len();
                            // 只在调试模式下显示
                            if cfg!(debug_assertions) {
                                println!("=== [Backend] Processing file {}: {} bytes", name, file_size);
                            }
                            Some(FileNode {
                                name,
                                path: entry_path.to_string_lossy().to_string(),
                                size: file_size,
                                is_directory: false,
                                children: vec![],
                                inode: self.get_inode(&metadata),
                                children_count: None,
                            })
                        }
                    }
                    Err(e) => {
                        // 统计错误类型并静默处理
                        if e.to_string().contains("Permission denied") || e.to_string().contains("Operation not permitted") {
                            self.permission_errors.fetch_add(1, Ordering::Relaxed);
                        } else if e.to_string().contains("No such file") || e.to_string().contains("os error 2") {
                            self.not_found_errors.fetch_add(1, Ordering::Relaxed);
                        }

                        // 只在调试模式下显示
                        if cfg!(debug_assertions) {
                            println!("=== [Backend] Failed to get metadata for {}: {}", name, e);
                        }
                        None
                    }
                }
            })
            .collect();

        if cfg!(debug_assertions) {
            println!("=== [Backend] Found {} entries with depth", children.len());
        }

        // Sort by size (largest first)
        children.sort_by(|a, b| b.size.cmp(&a.size));

        if cfg!(debug_assertions) {
            println!(
                "=== [Backend] Final result with depth: {} items",
                children.len()
            );
        }
        Ok(children)
    }

    fn get_inode(&self, metadata: &fs::Metadata) -> Option<u64> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            Some(metadata.ino())
        }
        #[cfg(not(unix))]
        {
            None
        }
    }
}

// New Tauri commands for on-demand loading using rayon for parallel processing
#[tauri::command]
pub fn build_directory_cache(path: String, max_depth: Option<usize>) -> Result<String, String> {
    println!(
        "=== [Backend] Tauri command build_directory_cache called with path: {}, max_depth: {:?}",
        path, max_depth
    );

    // Use rayon parallel processing
    let result = rayon::scope(|_s| {
        let mut scanner = if let Some(depth) = max_depth {
            println!("=== [Backend] Creating scanner with max_depth: {}", depth);
            DiskScanner::with_max_depth(depth)
        } else {
            println!("=== [Backend] Creating scanner with default settings");
            DiskScanner::new()
        };
        let result = scanner.build_directory_cache(&path);

        // 获取错误统计信息
        let (permission_errors, not_found_errors) = scanner.get_error_stats();
        if permission_errors > 0 || not_found_errors > 0 {
            println!("=== [Backend] Error stats during cache build - Permission errors: {}, Not found errors: {}", permission_errors, not_found_errors);
        }

        result
    });

    match &result {
        Ok(msg) => println!("=== [Backend] build_directory_cache successful: {}", msg),
        Err(e) => println!("=== [Backend] build_directory_cache error: {}", e),
    }
    result
}

#[tauri::command]
pub fn get_directory_children_with_depth(
    path: String,
    max_depth: u32,
) -> Result<Vec<FileNode>, String> {
    println!("=== [Backend] Tauri command get_directory_children_with_depth called with path: {}, max_depth: {}", path, max_depth);

    // Use rayon for parallel processing
    let result = rayon::scope(|_s| {
        let scanner = DiskScanner::with_max_depth(max_depth as usize);
        let scan_result = scanner.get_directory_children_with_depth(&path, max_depth);

        // 获取错误统计信息
        let (permission_errors, not_found_errors) = scanner.get_error_stats();
        if permission_errors > 0 || not_found_errors > 0 {
            println!("=== [Backend] Error stats during scan - Permission errors: {}, Not found errors: {}", permission_errors, not_found_errors);
        }

        scan_result
    });

    match &result {
        Ok(children) => println!(
            "=== [Backend] Successfully returning {} children with depth {}",
            children.len(),
            max_depth
        ),
        Err(e) => println!(
            "=== [Backend] Error in get_directory_children_with_depth: {}",
            e
        ),
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_max_depth_reproduction() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let root = temp_dir.path();

        // Create 4 levels of nested directories
        // Level 1: L1
        // Level 2: L1/L2
        // Level 3: L1/L2/L3
        // Level 4: L1/L2/L3/L4
        fs::create_dir(root.join("L1")).unwrap();
        fs::create_dir(root.join("L1").join("L2")).unwrap();
        fs::create_dir(root.join("L1").join("L2").join("L3")).unwrap();
        fs::create_dir(root.join("L1").join("L2").join("L3").join("L4")).unwrap();

        let scanner = DiskScanner::new();
        let root_path = temp_dir.path().to_string_lossy().to_string();

        // Request depth 3
        let result = scanner.get_directory_children_with_depth(&root_path, 3);
        assert!(result.is_ok());
        let children = result.unwrap();

        // Check L1
        let l1 = children
            .iter()
            .find(|c| c.name == "L1")
            .expect("Should find L1");
        println!("L1 children count: {}", l1.children.len());

        // Check L2 (Depth 2)
        if let Some(l2) = l1.children.iter().find(|c| c.name == "L2") {
            println!("Found L2");
            // Check L3 (Depth 3)
            if let Some(l3) = l2.children.iter().find(|c| c.name == "L3") {
                println!("Found L3");
                // Check L4 (Depth 4) - Should NOT be present if max_depth is 3
                if let Some(_l4) = l3.children.iter().find(|c| c.name == "L4") {
                    println!("Found L4 - This implies depth 4 is returned!");
                    panic!("Found L4 at depth 4 when max_depth was 3");
                } else {
                    println!("L4 not found - Correct behavior for depth 3");
                }
            } else {
                println!("L3 not found");
            }
        } else {
            println!("L2 not found");
        }
    }
}

#[tauri::command]
pub fn get_system_drives() -> Result<Vec<String>, String> {
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

#[tauri::command]
pub fn get_error_stats() -> Result<(usize, usize), String> {
    // 创建临时扫描器来获取错误统计
    let scanner = DiskScanner::new();
    let (permission_errors, not_found_errors) = scanner.get_error_stats();

    println!(
        "=== [Backend] Error stats - Permission errors: {}, Not found errors: {}",
        permission_errors, not_found_errors
    );
    Ok((permission_errors, not_found_errors))
}

#[tauri::command]
pub fn reset_error_stats() -> Result<(), String> {
    // 创建临时扫描器来重置错误统计
    let scanner = DiskScanner::new();
    scanner.reset_error_stats();

    println!("=== [Backend] Error stats reset");
    Ok(())
}
