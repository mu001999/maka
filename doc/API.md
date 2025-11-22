# API 文档

## Tauri 命令接口

### 1. get_system_drives
获取系统所有可用的磁盘驱动器。

**调用方式**:
```typescript
const drives = await invoke('get_system_drives');
```

**返回值**:
```typescript
string[] // 驱动器路径数组，如 ["/", "/Volumes/Data"]
```

**错误处理**:
- 权限不足: 抛出权限错误
- 系统错误: 抛出系统调用失败错误

### 2. build_cache
为指定路径构建文件系统缓存。

**调用方式**:
```typescript
await invoke('build_cache', { path: '/path/to/directory' });
```

**参数**:
```typescript
{
  path: string // 要构建缓存的目录路径
}
```

**返回值**:
```typescript
void
```

**错误处理**:
- 路径不存在: 抛出无效路径错误
- 权限不足: 抛出权限错误
- 内存不足: 抛出内存错误

### 3. get_directory_children
获取指定目录的子项信息。

**调用方式**:
```typescript
const children = await invoke('get_directory_children', { 
  path: '/path/to/directory',
  minSize: 1024 // 可选，最小文件大小过滤
});
```

**参数**:
```typescript
{
  path: string,    // 目录路径
  minSize?: number // 最小文件大小（字节），可选
}
```

**返回值**:
```typescript
FileInfo[] // 文件信息数组
```

**FileInfo 结构**:
```typescript
interface FileInfo {
  name: string;           // 文件/目录名
  path: string;           // 完整路径
  size: number;          // 大小（字节）
  is_directory: boolean;   // 是否为目录
  children?: FileInfo[]; // 子项（仅目录）
}
```

**错误处理**:
- 路径无效: 抛出路径验证错误
- 缓存未构建: 抛出缓存未就绪错误
- 系统错误: 抛出文件系统错误

### 4. get_file_info
获取单个文件或目录的详细信息。

**调用方式**:
```typescript
const info = await invoke('get_file_info', { path: '/path/to/file' });
```

**参数**:
```typescript
{
  path: string // 文件或目录路径
}
```

**返回值**:
```typescript
FileInfo // 文件信息对象
```

## 前端状态管理

### 应用状态 (App.tsx)
```typescript
interface AppState {
  currentData: FileInfo[];     // 当前显示的数据
  selectedPath: string | null; // 选中的根路径
  currentPath: string | null; // 当前浏览路径
  loading: boolean;           // 加载状态
  error: string | null;     // 错误信息
}
```

### 主要函数

#### loadDirectoryChildren(path: string)
加载指定目录的子项数据。

**实现逻辑**:
1. 验证路径有效性
2. 检查缓存状态
3. 调用后端 API
4. 更新组件状态
5. 错误处理

#### buildCache(path: string)
为指定路径构建缓存。

**实现逻辑**:
1. 显示加载状态
2. 调用 build_cache 命令
3. 等待构建完成
4. 更新 UI

#### handleError(error: any)
统一错误处理函数。

**错误分类**:
- 网络错误: 连接失败、超时
- 权限错误: 文件系统访问被拒绝
- 路径错误: 路径不存在、格式错误
- 系统错误: 内存不足、磁盘错误

## 事件系统

### 前端事件

#### 全局错误事件
```typescript
window.addEventListener('error', handleError);
window.addEventListener('unhandledrejection', handleUnhandledRejection);
```

#### 组件事件
- `onDirectorySelect`: 目录选择事件
- `onPathChange`: 路径变更事件
- `onLoadingStateChange`: 加载状态变更事件

### 后端事件

#### 扫描进度事件
```rust
// 未来扩展：进度报告
event::emit("scan_progress", ProgressEvent {
    current_path: path,
    processed_files: count,
    total_size: size,
});
```

## 性能优化

### 1. 批量处理
- 批量 API 调用减少网络开销
- 批量状态更新减少重渲染

### 2. 缓存策略
- 后端内存缓存避免重复扫描
- 前端数据缓存减少 API 调用

### 3. 虚拟化
- 大数据集虚拟滚动
- 按需加载和渲染

### 4. 防抖节流
- 用户输入防抖
- 滚动事件节流

## 安全考虑

### 1. 路径验证
```typescript
function validatePath(path: string): boolean {
  // 防止路径遍历攻击
  // 验证路径格式
  // 检查路径权限
}
```

### 2. 输入过滤
- 过滤危险字符
- 限制路径长度
- 验证文件类型

### 3. 错误信息
- 不暴露系统敏感信息
- 提供用户友好的错误消息
- 记录详细错误日志

## 扩展接口

### 未来扩展功能

#### 文件搜索
```typescript
interface SearchOptions {
  pattern: string;      // 搜索模式
  path: string;         // 搜索路径
  caseSensitive: boolean; // 大小写敏感
  regex: boolean;      // 是否使用正则表达式
}

const results = await invoke('search_files', options);
```

#### 文件操作
```typescript
// 复制、移动、删除文件
await invoke('copy_file', { source: string, destination: string });
await invoke('move_file', { source: string, destination: string });
await invoke('delete_file', { path: string });
```

#### 导出功能
```typescript
// 导出扫描结果
await invoke('export_scan_results', { 
  format: 'json' | 'csv' | 'xml',
  path: string 
});
```