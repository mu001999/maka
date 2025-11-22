use std::fs;
use std::os::unix::fs::MetadataExt;
use std::path::Path;
use std::sync::Arc;
use std::sync::RwLock;
use std::time::Instant;
use std::collections::HashMap;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskScanResult {
    pub root: FileNode,
    pub total_size: u64,
    pub file_count: u64,
    pub dir_count: u64,
}

// Global cache for directory information
static DIRECTORY_CACHE: once_cell::sync::Lazy<RwLock<Option<HashMap<String, DirectoryInfo>>>> =
    once_cell::sync::Lazy::new(|| RwLock::new(None));

pub struct DiskScanner {
    seen_inodes: Arc<DashMap<(u64, u64), bool>>,
    max_depth: Option<usize>,
    cache: Arc<DashMap<String, DirectoryInfo>>,
}

impl DiskScanner {
    pub fn new() -> Self {
        Self {
            seen_inodes: Arc::new(DashMap::new()),
            max_depth: None,
            cache: Arc::new(DashMap::new()),
        }
    }

    pub fn with_max_depth(max_depth: usize) -> Self {
        Self {
            seen_inodes: Arc::new(DashMap::new()),
            max_depth: Some(max_depth),
            cache: Arc::new(DashMap::new()),
        }
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
        let cache_map: HashMap<String, DirectoryInfo> = self.cache.iter()
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
        let name = path.file_name()
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

    fn scan_directory_contents_for_cache(&mut self, path: &Path, dir_name: String, depth: usize) -> Result<(), String> {
        let entries = match fs::read_dir(path) {
            Ok(entries) => entries,
            Err(_) => return Ok(()),
        };

        // Collect and filter entries
        let mut entry_list: Vec<_> = entries
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                !name_str.starts_with('.') &&
                !matches!(name_str.as_ref(), "proc" | "sys" | "dev" | "run" | "tmp")
            })
            .collect();

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

        self.cache.insert(path.to_string_lossy().to_string(), dir_info);

        Ok(())
    }

    // Get directory info from cache or calculate on demand
    pub fn get_directory_info(&self, path: &str) -> Result<DirectoryInfo, String> {
        // First try to get from cache
        if let Some(info) = self.cache.get(path) {
            return Ok(info.clone());
        }

        // If not in cache, calculate on demand
        let path_obj = Path::new(path);
        if !path_obj.exists() {
            return Err("Path does not exist".to_string());
        }

        if !path_obj.is_dir() {
            return Err("Path is not a directory".to_string());
        }

        let name = path_obj.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        // Read directory to get children count and names
        let entries = match fs::read_dir(path_obj) {
            Ok(entries) => entries,
            Err(e) => return Err(e.to_string()),
        };

        let mut children_count = 0;
        let mut children_names = Vec::new();

        for entry in entries {
            if let Ok(entry) = entry {
                children_count += 1;
                if let Some(name) = entry.file_name().to_str() {
                    children_names.push(name.to_string());
                }
            }
        }

        // Calculate directory size
        let size = self.calculate_directory_size(path_obj).unwrap_or(0);

        Ok(DirectoryInfo {
            name,
            path: path.to_string(),
            size,
            is_directory: true,
            children_count,
            children_names,
        })
    }

    // Get immediate children of a directory
    pub fn get_directory_children(&self, path: &str) -> Result<Vec<FileNode>, String> {
        println!("=== [Backend] get_directory_children called for path: {}", path);

        let path = Path::new(path);
        if !path.exists() {
            println!("=== [Backend] Path does not exist: {}", path.display());
            return Err("Path does not exist".to_string());
        }

        println!("=== [Backend] Reading directory: {}", path.display());
        let entries = match fs::read_dir(path) {
            Ok(entries) => entries,
            Err(e) => {
                println!("=== [Backend] Failed to read directory: {}", e);
                return Err(e.to_string());
            }
        };

        // Use rayon for parallel processing of directory entries
        let mut children: Vec<FileNode> = entries
            .par_bridge() // Convert to parallel iterator
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                let should_include = !name_str.starts_with('.') &&
                !matches!(name_str.as_ref(), "proc" | "sys" | "dev" | "run" | "tmp");

                if !should_include {
                    println!("=== [Backend] Filtering out hidden/system directory: {}", name_str);
                }
                should_include
            })
            .filter_map(|entry| {
                let entry_path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();

                println!("=== [Backend] Processing entry: {}", name);

                match fs::metadata(&entry_path) {
                    Ok(metadata) => {
                        if metadata.is_dir() {
                            // Try to get cached size, otherwise calculate
                            let size = if let Some(cached_info) = self.cache.get(&entry_path.to_string_lossy().to_string()) {
                                println!("=== [Backend] Found cached size for directory {}: {} bytes", name, cached_info.size);
                                cached_info.size
                            } else {
                                println!("=== [Backend] Calculating size for directory: {}", name);
                                let calculated_size = self.calculate_directory_size(&entry_path).unwrap_or(0);
                                println!("=== [Backend] Calculated size for directory {}: {} bytes", name, calculated_size);
                                calculated_size
                            };

                            Some(FileNode {
                                name,
                                path: entry_path.to_string_lossy().to_string(),
                                size,
                                is_directory: true,
                                children: vec![], // Don't populate children, load on demand
                                inode: self.get_inode(&metadata),
                            })
                        } else {
                            let file_size = metadata.len();
                            println!("=== [Backend] Processing file {}: {} bytes", name, file_size);
                            Some(FileNode {
                                name,
                                path: entry_path.to_string_lossy().to_string(),
                                size: file_size,
                                is_directory: false,
                                children: vec![],
                                inode: self.get_inode(&metadata),
                            })
                        }
                    }
                    Err(e) => {
                        println!("=== [Backend] Failed to get metadata for {}: {}", name, e);
                        None
                    }
                }
            })
            .collect();

        println!("=== [Backend] Found {} entries before filtering", children.len());

        // Sort by size (largest first)
        children.sort_by(|a, b| b.size.cmp(&a.size));

        // Note: We don't apply MIN_SIZE_THRESHOLD filtering here because get_directory_children
        // is meant to return all immediate children regardless of size, unlike scan_directory
        // which is used for visualization and applies size filtering

        println!("=== [Backend] Final result: {} items (no size filtering applied)", children.len());
        Ok(children)
    }

    fn calculate_directory_size(&self, path: &Path) -> Result<u64, String> {
        if let Some(cached_info) = self.cache.get(&path.to_string_lossy().to_string()) {
            return Ok(cached_info.size);
        }

        // Use scan_node to properly handle hard links and other edge cases
        match self.scan_node(path, 0) {
            Ok(node) => Ok(node.size),
            Err(_) => Ok(0),
        }
    }

    // Legacy method for compatibility
    pub fn scan_directory(&mut self, path: &str) -> Result<DiskScanResult, String> {
        let path = Path::new(path);
        if !path.exists() {
            return Err("Path does not exist".to_string());
        }

        let start_time = Instant::now();
        let mut root = self.scan_node(path, 0)?;
        let scan_duration = start_time.elapsed();

        println!("Scan completed in {:?}", scan_duration);

        let total_size = root.size;
        let (file_count, dir_count) = self.count_nodes(&root);

        self.sort_nodes_by_size(&mut root);

        Ok(DiskScanResult {
            root,
            total_size,
            file_count,
            dir_count,
        })
    }

    fn scan_node(&self, path: &Path, depth: usize) -> Result<FileNode, String> {
        let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
        let name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let inode = self.get_inode(&metadata);

        if let Some(inode_val) = inode {
            let key = (metadata.dev(), inode_val);
            if self.seen_inodes.contains_key(&key) {
                return Ok(FileNode {
                    name,
                    path: path.to_string_lossy().to_string(),
                    size: 0,
                    is_directory: metadata.is_dir(),
                    children: vec![],
                    inode: Some(inode_val),
                });
            }
            self.seen_inodes.insert(key, true);
        }

        if metadata.is_dir() {
            if let Some(max_depth) = self.max_depth {
                if depth >= max_depth {
                    return Ok(FileNode {
                        name,
                        path: path.to_string_lossy().to_string(),
                        size: 0,
                        is_directory: true,
                        children: vec![],
                        inode,
                    });
                }
            }
            self.scan_directory_node(path, name, inode, depth)
        } else {
            Ok(FileNode {
                name,
                path: path.to_string_lossy().to_string(),
                size: metadata.len(),
                is_directory: false,
                children: vec![],
                inode,
            })
        }
    }

    fn scan_directory_node(&self, path: &Path, name: String, inode: Option<u64>, depth: usize) -> Result<FileNode, String> {
        let entries = match fs::read_dir(path) {
            Ok(entries) => entries,
            Err(_) => {
                return Ok(FileNode {
                    name,
                    path: path.to_string_lossy().to_string(),
                    size: 0,
                    is_directory: true,
                    children: vec![],
                    inode,
                });
            }
        };

        let mut entry_list: Vec<_> = entries
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                !name_str.starts_with('.') &&
                !matches!(name_str.as_ref(), "proc" | "sys" | "dev" | "run" | "tmp")
            })
            .collect();

        entry_list.sort_by_key(|entry| entry.file_name().to_string_lossy().to_lowercase());

        const MAX_ENTRIES_PER_DIR: usize = 500;
        if entry_list.len() > MAX_ENTRIES_PER_DIR {
            entry_list.truncate(MAX_ENTRIES_PER_DIR);
        }

        let children: Vec<FileNode> = entry_list
            .par_iter()
            .filter_map(|entry| {
                self.scan_node(&entry.path(), depth + 1).ok()
            })
            .collect();

        let total_size = children
            .iter()
            .filter(|child| child.size > 0)
            .map(|child| child.size)
            .sum();

        Ok(FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            size: total_size,
            is_directory: true,
            children,
            inode,
        })
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

    fn count_nodes(&self, node: &FileNode) -> (u64, u64) {
        if node.is_directory {
            let (mut files, mut dirs) = (0, 1);
            for child in &node.children {
                let (f, d) = self.count_nodes(child);
                files += f;
                dirs += d;
            }
            (files, dirs)
        } else {
            // Only count files with size > 0 (hard links have size 0 to avoid double counting)
            if node.size > 0 {
                (1, 0)
            } else {
                (0, 0)
            }
        }
    }

    fn sort_nodes_by_size(&mut self, node: &mut FileNode) {
        if node.is_directory {
            node.children.sort_by(|a, b| b.size.cmp(&a.size));
            const MIN_SIZE_THRESHOLD: u64 = 1024;
            node.children.retain(|child| child.size >= MIN_SIZE_THRESHOLD || child.is_directory);
            for child in &mut node.children {
                self.sort_nodes_by_size(child);
            }
        }
    }
}

// New Tauri commands for on-demand loading using rayon for parallel processing
#[tauri::command]
pub fn build_directory_cache(path: String, max_depth: Option<usize>) -> Result<String, String> {
    println!("=== [Backend] Tauri command build_directory_cache called with path: {}, max_depth: {:?}", path, max_depth);

    // Use rayon parallel processing
    let result = rayon::scope(|_s| {
        let mut scanner = if let Some(depth) = max_depth {
            println!("=== [Backend] Creating scanner with max_depth: {}", depth);
            DiskScanner::with_max_depth(depth)
        } else {
            println!("=== [Backend] Creating scanner with default settings");
            DiskScanner::new()
        };
        scanner.build_directory_cache(&path)
    });

    match &result {
        Ok(msg) => println!("=== [Backend] build_directory_cache successful: {}", msg),
        Err(e) => println!("=== [Backend] build_directory_cache error: {}", e),
    }
    result
}

#[tauri::command]
pub fn get_directory_info(path: String) -> Result<DirectoryInfo, String> {
    println!("=== [Backend] Tauri command get_directory_info called with path: {}", path);

    // Try to get from global cache first
    println!("=== [Backend] Checking global cache for path: {}", path);
    if let Ok(global_cache) = DIRECTORY_CACHE.read() {
        if let Some(ref cache) = *global_cache {
            if let Some(info) = cache.get(&path) {
                println!("=== [Backend] Found in global cache: {:?}", info);
                return Ok(info.clone());
            }
        }
    }

    println!("=== [Backend] Not found in global cache, creating scanner...");
    // If not in global cache, create a scanner and scan on demand
    let scanner = DiskScanner::new();
    let result = scanner.get_directory_info(&path);

    match &result {
        Ok(info) => println!("=== [Backend] get_directory_info successful: {:?}", info),
        Err(e) => println!("=== [Backend] get_directory_info error: {}", e),
    }
    result
}

#[tauri::command]
pub fn get_directory_children(path: String) -> Result<Vec<FileNode>, String> {
    println!("=== [Backend] Tauri command get_directory_children called with path: {}", path);

    // Use rayon for parallel processing
    let result = rayon::scope(|_s| {
        let scanner = DiskScanner::new();
        scanner.get_directory_children(&path)
    });

    match &result {
        Ok(children) => println!("=== [Backend] Successfully returning {} children", children.len()),
        Err(e) => println!("=== [Backend] Error in get_directory_children: {}", e),
    }
    result
}

#[tauri::command]
pub fn scan_directory(path: String, max_depth: Option<usize>) -> Result<DiskScanResult, String> {
    // Use rayon for parallel processing
    rayon::scope(|_s| {
        let mut scanner = if let Some(depth) = max_depth {
            DiskScanner::with_max_depth(depth)
        } else {
            DiskScanner::new()
        };
        scanner.scan_directory(&path)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use std::io::Write;
    use tempfile::TempDir;

    fn create_test_directory_structure() -> TempDir {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let root = temp_dir.path();

        // Create test files and directories
        fs::create_dir(root.join("subdir1")).unwrap();
        fs::create_dir(root.join("subdir2")).unwrap();
        fs::create_dir(root.join("subdir1").join("nested")).unwrap();

        // Create test files with content larger than 1024 bytes to pass size filter
        let large_content = "A".repeat(2048); // 2048 bytes

        let mut file1 = File::create(root.join("file1.txt")).unwrap();
        file1.write_all(large_content.as_bytes()).unwrap();

        let mut file2 = File::create(root.join("subdir1").join("file2.txt")).unwrap();
        file2.write_all(large_content.as_bytes()).unwrap();

        let mut file3 = File::create(root.join("subdir1").join("nested").join("file3.txt")).unwrap();
        file3.write_all(large_content.as_bytes()).unwrap();

        // Create large file in root
        let mut file4 = File::create(root.join("large_file.txt")).unwrap();
        file4.write_all(large_content.as_bytes()).unwrap();

        // Create a file with some content but still below threshold
        let mut small_file = File::create(root.join("small_file.txt")).unwrap();
        small_file.write_all(b"Small content").unwrap();

        temp_dir
    }

    #[test]
    fn test_disk_scanner_creation() {
        let scanner = DiskScanner::new();
        assert!(scanner.max_depth.is_none());
        assert!(scanner.cache.is_empty());
        assert!(scanner.seen_inodes.is_empty());
    }

    #[test]
    fn test_disk_scanner_with_max_depth() {
        let scanner = DiskScanner::with_max_depth(3);
        assert_eq!(scanner.max_depth, Some(3));
        assert!(scanner.cache.is_empty());
        assert!(scanner.seen_inodes.is_empty());
    }

    #[test]
    fn test_scan_directory_basic() {
        let temp_dir = create_test_directory_structure();
        let mut scanner = DiskScanner::new();

        let result = scanner.scan_directory(temp_dir.path().to_str().unwrap());
        assert!(result.is_ok());

        let scan_result = result.unwrap();
        assert!(scan_result.total_size > 0);
        assert_eq!(scan_result.file_count, 5); // 5 files total (4 large + 1 small)
        assert_eq!(scan_result.dir_count, 4); // 4 directories total (including root)
        assert!(scan_result.root.is_directory);
        // Due to size filtering (MIN_SIZE_THRESHOLD = 1024), only large files and directories are kept
        // We have 4 large files and 3 directories, but directories might be filtered if empty
        assert!(scan_result.root.children.len() >= 4);
    }

    #[test]
    fn test_scan_directory_with_max_depth() {
        let temp_dir = create_test_directory_structure();
        let mut scanner = DiskScanner::with_max_depth(1);

        let result = scanner.scan_directory(temp_dir.path().to_str().unwrap());
        assert!(result.is_ok());

        let scan_result = result.unwrap();
        // Should only scan root level due to max_depth = 1
        // Due to size filtering, only large files are kept
        assert!(scan_result.root.children.len() >= 4);
    }

    #[test]
    fn test_get_directory_info() {
        let temp_dir = create_test_directory_structure();
        let scanner = DiskScanner::new();

        let result = scanner.get_directory_info(temp_dir.path().to_str().unwrap());
        assert!(result.is_ok());

        let dir_info = result.unwrap();
        assert_eq!(dir_info.name, temp_dir.path().file_name().unwrap().to_str().unwrap());
        assert_eq!(dir_info.path, temp_dir.path().to_string_lossy().to_string());
        assert!(dir_info.is_directory);
        // Children count includes all items, regardless of size filtering
        assert!(dir_info.children_count >= 4); // At least 4 direct children
    }

    #[test]
    fn test_get_directory_children() {
        let temp_dir = create_test_directory_structure();
        let scanner = DiskScanner::new();

        let result = scanner.get_directory_children(temp_dir.path().to_str().unwrap());
        assert!(result.is_ok());

        let children = result.unwrap();
        // get_directory_children returns all items, regardless of size filtering
        assert!(children.len() >= 4); // At least 4 direct children

        // Check that we have both files and directories
        let has_file = children.iter().any(|child| !child.is_directory && child.name == "file1.txt");
        let has_dir = children.iter().any(|child| child.is_directory && child.name == "subdir1");

        assert!(has_file);
        assert!(has_dir);
    }

    #[test]
    fn test_build_directory_cache() {
        let temp_dir = create_test_directory_structure();
        let mut scanner = DiskScanner::new();

        let result = scanner.build_directory_cache(temp_dir.path().to_str().unwrap());
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Cache built successfully");

        // Verify cache was populated
        assert!(!scanner.cache.is_empty());

        // Check that root directory is in cache
        let root_path = temp_dir.path().to_string_lossy().to_string();
        assert!(scanner.cache.contains_key(&root_path));

        let root_info = scanner.cache.get(&root_path).unwrap();
        // Children count includes all items, regardless of size filtering
        assert!(root_info.children_count >= 4);
    }

    #[test]
    fn test_nonexistent_path() {
        let mut scanner = DiskScanner::new();
        let result = scanner.scan_directory("/nonexistent/path");
        assert!(result.is_err());
    }

    #[test]
    fn test_empty_directory() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let mut scanner = DiskScanner::new();

        let result = scanner.scan_directory(temp_dir.path().to_str().unwrap());
        assert!(result.is_ok());

        let scan_result = result.unwrap();
        assert_eq!(scan_result.total_size, 0);
        assert_eq!(scan_result.file_count, 0);
        assert_eq!(scan_result.dir_count, 1); // Only root directory
        assert!(scan_result.root.children.is_empty());
    }

    #[test]
    fn test_file_instead_of_directory() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let file_path = temp_dir.path().join("test_file.txt");

        let mut file = File::create(&file_path).unwrap();
        file.write_all(b"test content").unwrap();

        let scanner = DiskScanner::new();
        let result = scanner.get_directory_info(file_path.to_str().unwrap());

        // Should return error since it's a file, not a directory
        assert!(result.is_err());
    }

    #[test]
    fn test_parallel_processing() {
        let temp_dir = create_test_directory_structure();
        let mut scanner = DiskScanner::new();

        // Test that rayon parallel processing works
        let result = scanner.scan_directory(temp_dir.path().to_str().unwrap());
        assert!(result.is_ok());

        let scan_result = result.unwrap();
        assert!(scan_result.root.children.len() > 0);

        // Verify that children are sorted by size (largest first)
        let children = &scan_result.root.children;
        for i in 1..children.len() {
            assert!(children[i-1].size >= children[i].size);
        }
    }

    #[test]
    fn test_hard_link_detection() {
        #[cfg(unix)]
        {
            let temp_dir = TempDir::new().expect("Failed to create temp directory");
            let file_path = temp_dir.path().join("original.txt");
            let link_path = temp_dir.path().join("link.txt");

            // Create original file with large content to pass size filter
            let large_content = "A".repeat(2048);
            let mut file = File::create(&file_path).unwrap();
            file.write_all(large_content.as_bytes()).unwrap();

            // Create hard link
            fs::hard_link(&file_path, &link_path).unwrap();

            let mut scanner = DiskScanner::new();
            let result = scanner.scan_directory(temp_dir.path().to_str().unwrap());
            assert!(result.is_ok());

            let scan_result = result.unwrap();
            // Should only count the file once due to hard link detection
            assert_eq!(scan_result.file_count, 1);
        }
    }

    #[test]
    fn test_symlink_handling() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;

            let temp_dir = TempDir::new().expect("Failed to create temp directory");
            let target_dir = temp_dir.path().join("target");
            let link_dir = temp_dir.path().join("link");

            fs::create_dir(&target_dir).unwrap();
            let mut file = File::create(target_dir.join("file.txt")).unwrap();
            file.write_all(b"test content").unwrap();

            symlink(&target_dir, &link_dir).unwrap();

            let mut scanner = DiskScanner::new();
            let result = scanner.scan_directory(temp_dir.path().to_str().unwrap());

            // Should handle symlinks gracefully
            assert!(result.is_ok());
        }
    }

    #[test]
    fn test_get_system_drives() {
        let result = get_system_drives();
        assert!(result.is_ok());

        let drives = result.unwrap();
        assert!(!drives.is_empty());

        // Should contain root directory for Unix-like systems
        #[cfg(unix)]
        assert!(drives.contains(&"/".to_string()));
    }

    #[test]
    fn test_tauri_commands() {
        let temp_dir = create_test_directory_structure();
        let path = temp_dir.path().to_string_lossy().to_string();

        // Test build_directory_cache command
        let result = build_directory_cache(path.clone(), Some(2));
        assert!(result.is_ok());

        // Test get_directory_info command
        let result = get_directory_info(path.clone());
        assert!(result.is_ok());

        // Test get_directory_children command
        let result = get_directory_children(path.clone());
        assert!(result.is_ok());

        // Test scan_directory command
        let result = scan_directory(path, Some(2));
        assert!(result.is_ok());
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
