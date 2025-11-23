# 组件文档

## 组件概览

```
src/components/
├── SunburstChart.tsx    # 旭日图可视化组件
└── TreemapChart.tsx     # 树状图可视化组件
```

## SunburstChart 组件

### 功能描述
旭日图组件用于以层级圆形布局展示磁盘使用情况，每个层级代表目录结构的一个深度级别。

### Props 接口
```typescript
interface SunburstChartProps {
  data: FileNode[];
  onNodeClick: (node: FileNode) => void;
  width?: number;
  height?: number;
}

interface FileNode {
  name: string;
  path: string;
  size: number;
  is_directory: boolean;
  children: FileNode[];
  inode?: number;
  children_count?: number;
}
```

### 使用示例
```typescript
import SunburstChart from './components/SunburstChart';

function App() {
  const [currentData, setCurrentData] = useState<FileNode[]>([]);

  const handleNodeClick = (node: FileNode) => {
    console.log('Clicked node:', node.name);
    // 处理点击事件，如导航到子目录
  };

  return (
    <SunburstChart
      data={currentData}
      onNodeClick={handleNodeClick}
      width={800}
      height={800}
    />
  );
}
```

### 技术实现

#### D3.js 集成
组件使用 D3.js 的 `partition` 布局和 `arc` 生成器来渲染旭日图。

- **布局**: `d3.partition`
- **渲染**: `d3.arc`
- **交互**: 支持鼠标悬停高亮和点击事件

#### 颜色方案
使用 `d3.schemeCategory10` 作为基础颜色方案。

## TreemapChart 组件

### 功能描述
树状图组件使用矩形嵌套布局展示磁盘使用情况，矩形大小与文件/目录大小成正比。

### Props 接口
```typescript
interface TreemapChartProps {
  data: FileNode[];
  width?: number;
  height?: number;
  onNodeClick: (node: FileNode) => void;
}
```

### 使用示例
```typescript
import TreemapChart from './components/TreemapChart';

function App() {
  const [currentData, setCurrentData] = useState<FileNode[]>([]);

  const handleNodeClick = (node: FileNode) => {
    if (node.is_directory) {
      // 导航到子目录
    }
  };

  return (
    <TreemapChart
      data={currentData}
      width={800}
      height={600}
      onNodeClick={handleNodeClick}
    />
  );
}
```

### 技术实现

#### D3.js 树状图布局
组件使用 D3.js 的 `treemap` 布局。

- **布局**: `d3.treemap`
- **平铺算法**: `d3.treemapSquarify` (默认)
- **交互**: 支持鼠标悬停显示详细信息和点击导航

#### 显示策略
- **目录**: 蓝色系 (`#3498db`)
- **文件**: 橙色系 (`#f39c12`)
- **标签**: 智能显示，仅在空间足够时显示名称和大小
