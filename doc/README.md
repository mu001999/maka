# Maka - Disk Usage Analyzer

## 项目概述

Maka 是一个基于 Tauri + React + Rust 的磁盘使用分析工具，提供直观的磁盘空间可视化界面。

## 技术栈

- **前端**: React 18 + TypeScript + Vite
- **后端**: Rust + Tauri
- **可视化**: D3.js (Sunburst Chart, Treemap Chart)
- **构建工具**: Vite (前端) + Tauri CLI (后端)

## 项目结构

```
maka/
├── src/                    # 前端源代码
│   ├── App.tsx            # 主应用组件
│   ├── main.tsx           # 应用入口
│   ├── components/        # React 组件
│   │   ├── SunburstChart.tsx  # 旭日图组件
│   │   └── TreemapChart.tsx   # 树状图组件
│   └── *.css              # 样式文件
├── src-tauri/             # Tauri 后端源代码
│   ├── src/
│   │   ├── main.rs        # 主入口文件
│   │   ├── disk_scanner.rs    # 磁盘扫描器核心
│   │   └── permissions.rs     # 权限管理
│   ├── Cargo.toml         # Rust 依赖配置
│   └── tauri.conf.json    # Tauri 配置
├── doc/                   # 项目文档
└── 配置文件
    ├── package.json       # Node.js 依赖和脚本
    ├── tsconfig.json      # TypeScript 配置
    ├── vite.config.ts     # Vite 构建配置
    └── Cargo.toml         # 工作区配置
```

## 核心功能

### 1. 磁盘扫描 (Rust 后端)
- 递归扫描目录结构
- 计算文件和目录大小
- 并行处理优化性能
- 智能过滤系统目录
- 缓存机制提升性能

### 2. 数据可视化 (React 前端)
- 旭日图 (Sunburst Chart): 层级结构展示
- 树状图 (Treemap Chart): 空间占比展示
- 交互式导航
- 实时数据更新

### 3. 系统集成 (Tauri)
- 跨平台桌面应用
- 原生系统权限访问
- 系统驱动器枚举

## 开发环境

### 前置要求
- Node.js 16+
- Rust 1.70+
- Tauri CLI

### 开发命令
```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 构建应用
npm run tauri build
```

## 配置说明

### Tauri 配置 (src-tauri/tauri.conf.json)
- 应用元数据和窗口设置
- 安全策略和权限配置
- 构建和打包选项

### 前端配置
- Vite 配置: 开发服务器和构建选项
- TypeScript 配置: 类型检查和编译选项

## 注意事项

1. **权限要求**: 应用需要文件系统访问权限
2. **性能考虑**: 大目录扫描可能需要较长时间
3. **平台兼容性**: 支持 macOS、Windows、Linux

## 更新日志

- 2024: 初始版本，基础磁盘扫描和可视化功能