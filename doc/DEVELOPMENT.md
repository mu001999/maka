# 开发指南

## 环境设置

### 前置要求

1. **Node.js** (版本 16 或更高)
   ```bash
   node --version  # 验证安装
   ```

2. **Rust** (版本 1.70 或更高)
   ```bash
   rustc --version  # 验证安装
   cargo --version  # 验证安装
   ```

3. **Tauri CLI**
   ```bash
   cargo install tauri-cli
   ```

4. **系统依赖**
   - macOS: Xcode Command Line Tools
   - Windows: Microsoft C++ Build Tools
   - Linux: build-essential, curl, wget, file, libssl-dev, libgtk-3-dev, libayatana-appindicator3-dev, librsvg2-dev

### 项目初始化

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd maka
   ```

2. **安装前端依赖**
   ```bash
   npm install
   ```

3. **验证环境**
   ```bash
   npm run tauri info
   ```

## 开发工作流

### 日常开发

1. **启动开发服务器**
   ```bash
   npm run tauri dev
   ```
   这将同时启动：
   - Vite 开发服务器 (前端)
   - Tauri 应用 (后端 + WebView)

2. **开发模式特性**
   - 热模块替换 (HMR)
   - 自动重载
   - 调试工具
   - 错误覆盖层

### 代码组织

#### 前端开发 (src/)
```
src/
├── App.tsx              # 主组件和状态管理
├── main.tsx             # 应用入口
├── components/          # 可复用组件
│   ├── SunburstChart.tsx
│   └── TreemapChart.tsx
├── hooks/               # 自定义 Hooks (如需要)
├── utils/               # 工具函数
└── types/               # TypeScript 类型定义
```

#### 后端开发 (src-tauri/src/)
```
src-tauri/src/
├── main.rs              # 主入口和命令定义
├── disk_scanner.rs      # 磁盘扫描核心逻辑
├── permissions.rs       # 权限管理
├── error.rs            # 错误处理 (如需要)
└── utils.rs            # 工具函数 (如需要)
```

### 编码规范

#### TypeScript/React
```typescript
// 组件命名: PascalCase
export const SunburstChart: React.FC<Props> = ({ data }) => {
  // 使用 Hooks
  const [state, setState] = useState(initialState);
  
  // 副作用处理
  useEffect(() => {
    // 清理函数
    return () => { /* cleanup */ };
  }, [dependencies]);
  
  return <div>{/* JSX */}</div>;
};
```

#### Rust
```rust
// 结构体命名: PascalCase
pub struct DiskScanner {
    cache: Arc<Mutex<HashMap<String, Vec<FileInfo>>>>,
}

// 函数命名: snake_case
impl DiskScanner {
    pub fn new() -> Self {
        // 实现
    }
    
    pub fn build_directory_cache(&mut self, path: &str, max_depth: usize) -> Result<String, Error> {
        // 错误处理
        match fs::read_dir(path) {
            Ok(entries) => { /* 处理 */ },
            Err(e) => return Err(Error::IoError(e)),
        }
    }
}
```

### 调试技巧

#### 前端调试
1. **浏览器开发者工具**
   - 元素检查
   - 控制台日志
   - 网络请求监控
   - 性能分析

2. **React 开发者工具**
   ```bash
   npm install --save-dev react-devtools
   ```

3. **日志记录**
   ```typescript
   console.log('[Component] Debug info:', data);
   console.error('[Component] Error:', error);
   ```

#### 后端调试
1. **Rust 日志**
   ```rust
   use log::{info, warn, error};
   
   info!("Scanning directory: {}", path);
   warn!("Large directory detected: {}", path);
   error!("Failed to read directory: {}", e);
   ```

2. **Tauri 调试**
   ```bash
   RUST_LOG=debug npm run tauri dev
   ```

3. **性能分析**
   ```rust
   use std::time::Instant;
   
   let start = Instant::now();
   // 操作
   let duration = start.elapsed();
   println!("Operation took: {:?}", duration);
   ```

### 测试策略

#### 前端测试
```bash
# 单元测试 (如使用 Jest)
npm test

# 组件测试 (如使用 React Testing Library)
npm run test:components

# 端到端测试 (如使用 Playwright)
npm run test:e2e
```

#### 后端测试
```bash
# Rust 单元测试
cargo test

# 集成测试
cargo test --test integration

# 性能测试
cargo bench
```

### 构建和发布

#### 开发构建
```bash
# 前端构建
npm run build

# Tauri 构建
cargo build
```

#### 生产构建
```bash
# 完整应用构建
npm run tauri build
```

构建输出：
- macOS: `src-tauri/target/release/bundle/dmg/`
- Windows: `src-tauri/target/release/bundle/msi/`
- Linux: `src-tauri/target/release/bundle/deb/` 或 `src-tauri/target/release/bundle/rpm/`

## 常见问题

### 1. 开发服务器无法启动
**问题**: `npm run tauri dev` 失败
**解决**:
```bash
# 清理缓存
rm -rf node_modules package-lock.json
npm install

# 检查系统依赖
npm run tauri info
```

### 2. 权限问题 (macOS)
**问题**: 无法访问文件系统
**解决**:
- 系统偏好设置 → 安全性与隐私 → 文件和文件夹
- 添加终端和应用程序的访问权限

### 3. 构建失败
**问题**: 构建过程中出现错误
**解决**:
```bash
# 清理构建缓存
cargo clean
rm -rf dist/

# 重新构建
npm run tauri build
```

### 4. 性能问题
**问题**: 大目录扫描缓慢
**解决**:
- 调整并行度参数
- 增加缓存大小
- 优化过滤条件

## 最佳实践

### 1. 状态管理
- 使用 React Hooks 进行局部状态管理
- 考虑 Context API 或 Redux 进行全局状态管理 (如需要)
- 避免过度渲染，使用 React.memo 和 useMemo

### 2. 错误处理
- 统一的错误处理边界
- 用户友好的错误消息
- 详细的错误日志记录

### 3. 性能优化
- 使用虚拟化处理大数据集
- 实现防抖和节流
- 合理使用缓存

### 4. 代码质量
- 使用 ESLint 和 Prettier 进行代码格式化
- 编写单元测试和集成测试
- 定期代码审查

## 扩展开发

### 添加新功能
1. **需求分析**: 明确功能需求和用户场景
2. **接口设计**: 设计前后端 API 接口
3. **实现**: 分别实现前端和后端逻辑
4. **测试**: 编写测试用例
5. **文档**: 更新相关文档

### 性能调优
1. **分析**: 使用性能分析工具
2. **优化**: 针对瓶颈进行优化
3. **验证**: 验证优化效果
4. **监控**: 建立性能监控机制

## 资源链接

- [Tauri 文档](https://tauri.app/v1/guides/)
- [React 文档](https://react.dev/)
- [Rust 文档](https://doc.rust-lang.org/)
- [Vite 文档](https://vitejs.dev/)
- [D3.js 文档](https://d3js.org/)