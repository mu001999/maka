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
  data: FileInfo[];           // 文件系统数据
  width?: number;            // 图表宽度 (默认: 800)
  height?: number;           // 图表高度 (默认: 800)
  onSegmentClick?: (data: FileInfo) => void; // 段点击事件回调
  selectedPath?: string;     // 当前选中的路径
}
```

### 使用示例
```typescript
import { SunburstChart } from './components/SunburstChart';

function App() {
  const [currentData, setCurrentData] = useState<FileInfo[]>([]);
  
  const handleSegmentClick = (data: FileInfo) => {
    console.log('Clicked segment:', data.name);
    // 处理点击事件，如导航到子目录
  };
  
  return (
    <SunburstChart
      data={currentData}
      width={800}
      height={800}
      onSegmentClick={handleSegmentClick}
      selectedPath="/Users"
    />
  );
}
```

### 技术实现

#### D3.js 集成
```typescript
import * as d3 from 'd3';

// 创建分区布局
const partition = d3.partition<FileInfo>()
  .size([2 * Math.PI, radius]);

// 创建弧形生成器
const arc = d3.arc<d3.HierarchyRectangularNode<FileInfo>>()
  .startAngle(d => d.x0)
  .endAngle(d => d.x1)
  .innerRadius(d => d.y0)
  .outerRadius(d => d.y1);
```

#### 颜色方案
```typescript
// 基于文件类型的颜色映射
const getColor = (d: FileInfo): string => {
  if (d.is_directory) {
    return d3.schemeCategory10[0]; // 目录使用蓝色系
  }
  // 根据文件扩展名确定颜色
  const ext = d.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js': return '#f7df1e'; // JavaScript - 黄色
    case 'ts': return '#3178c6'; // TypeScript - 蓝色
    case 'json': return '#f7df1e'; // JSON - 黄色
    case 'md': return '#ffffff'; // Markdown - 白色
    case 'jpg':
    case 'png':
    case 'gif': return '#ff6b6b'; // 图片 - 红色
    default: return '#95a5a6'; // 默认 - 灰色
  }
};
```

#### 交互功能
- **悬停效果**: 鼠标悬停时高亮显示
- **点击导航**: 点击目录段进入子目录
- **工具提示**: 显示详细信息（名称、大小、类型）
- **动画过渡**: 平滑的状态变化动画

### 性能优化
- **数据分层**: 只渲染当前可见层级
- **防抖处理**: 频繁的交互事件防抖
- **虚拟化**: 大数据集的虚拟渲染

## TreemapChart 组件

### 功能描述
树状图组件使用矩形嵌套布局展示磁盘使用情况，矩形大小与文件/目录大小成正比。

### Props 接口
```typescript
interface TreemapChartProps {
  data: FileInfo[];           // 文件系统数据
  width?: number;            // 图表宽度 (默认: 800)
  height?: number;           // 图表高度 (默认: 600)
  onRectClick?: (data: FileInfo) => void; // 矩形点击事件回调
  colorScheme?: string[];    // 自定义颜色方案
}
```

### 使用示例
```typescript
import { TreemapChart } from './components/TreemapChart';

function App() {
  const [currentData, setCurrentData] = useState<FileInfo[]>([]);
  
  const handleRectClick = (data: FileInfo) => {
    if (data.is_directory) {
      // 导航到子目录
      loadDirectoryChildren(data.path);
    }
  };
  
  return (
    <TreemapChart
      data={currentData}
      width={800}
      height={600}
      onRectClick={handleRectClick}
      colorScheme={['#3498db', '#e74c3c', '#2ecc71', '#f39c12']}
    />
  );
}
```

### 技术实现

#### D3.js 树状图布局
```typescript
import * as d3 from 'd3';

// 创建树状图布局
const treemap = d3.treemap<FileInfo>()
  .tile(d3.treemapSquaratio)  // 使用方形比例算法
  .size([width, height])
  .padding(2)
  .round(true);

// 层次化数据转换
const root = d3.hierarchy<FileInfo>(data)
  .sum(d => d.size)
  .sort((a, b) => b.value! - a.value!);
```

#### 布局算法选择
```typescript
// 不同的布局算法选项
const layoutAlgorithms = {
  squarify: d3.treemapSquarify,      // 最佳方形比例
  binary: d3.treemapBinary,         // 二叉树分割
  dice: d3.treemapDice,              // 水平分割
  slice: d3.treemapSlice,            // 垂直分割
  slicedice: d3.treemapSliceDice     // 混合分割
};
```

#### 标签显示策略
```typescript
// 智能标签显示
const shouldShowLabel = (d: d3.HierarchyRectangularNode<FileInfo>): boolean => {
  const width = d.x1 - d.x0;
  const height = d.y1 - d.y0;
  const area = width * height;
  
  // 只在大于最小面积的矩形上显示标签
  return area > 2000 && width > 50 && height > 20;
};

// 自适应字体大小
const getFontSize = (d: d3.HierarchyRectangularNode<FileInfo>): number => {
  const area = (d.x1 - d.x0) * (d.y1 - d.y0);
  return Math.min(14, Math.max(10, Math.sqrt(area) / 10));
};
```

### 交互功能
- **缩放**: 支持缩放查看细节
- **平移**: 拖动查看大图表
- **悬停**: 显示详细信息
- **点击**: 目录导航或文件预览

## 共享工具函数

### 数据格式化
```typescript
// utils/format.ts
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const formatFileName = (name: string, maxLength: number = 20): string => {
  return name.length > maxLength ? name.substring(0, maxLength) + '...' : name;
};
```

### 颜色工具
```typescript
// utils/colors.ts
export const generateColorScale = (count: number): string[] => {
  return d3.schemeCategory10.concat(d3.schemeSet3)
    .slice(0, Math.min(count, 20));
};

export const getContrastingColor = (backgroundColor: string): string => {
  // 计算亮度，返回黑色或白色对比色
  const rgb = d3.color(backgroundColor);
  if (!rgb) return '#000000';
  
  const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  return luminance > 128 ? '#000000' : '#ffffff';
};
```

### 数据处理
```typescript
// utils/data.ts
export const filterLargeFiles = (data: FileInfo[], minSize: number): FileInfo[] => {
  return data.filter(item => item.size >= minSize);
};

export const sortBySize = (data: FileInfo[]): FileInfo[] => {
  return [...data].sort((a, b) => b.size - a.size);
};

export const aggregateByType = (data: FileInfo[]): Map<string, number> => {
  const typeMap = new Map<string, number>();
  
  data.forEach(item => {
    if (!item.is_directory) {
      const ext = item.name.split('.').pop()?.toLowerCase() || 'unknown';
      typeMap.set(ext, (typeMap.get(ext) || 0) + item.size);
    }
  });
  
  return typeMap;
};
```

## 性能监控

### 渲染性能
```typescript
// 性能监控 Hook
export const useRenderPerformance = (componentName: string) => {
  const renderCount = useRef(0);
  const startTime = useRef(performance.now());
  
  useEffect(() => {
    renderCount.current++;
    const endTime = performance.now();
    const duration = endTime - startTime.current;
    
    console.log(`${componentName} rendered in ${duration.toFixed(2)}ms`);
    
    if (duration > 16) { // 超过一帧的时间 (60fps)
      console.warn(`${componentName} render performance issue: ${duration.toFixed(2)}ms`);
    }
  });
  
  return { renderCount: renderCount.current };
};
```

### 内存使用
```typescript
// 内存监控
export const useMemoryMonitor = () => {
  useEffect(() => {
    const interval = setInterval(() => {
      if (performance.memory) {
        const used = performance.memory.usedJSHeapSize;
        const total = performance.memory.totalJSHeapSize;
        const limit = performance.memory.jsHeapSizeLimit;
        
        console.log(`Memory: ${(used / 1024 / 1024).toFixed(2)}MB used of ${(total / 1024 / 1024).toFixed(2)}MB total`);
        
        if (used / limit > 0.9) {
          console.warn('High memory usage detected');
        }
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);
};
```

## 可访问性

### 键盘导航
```typescript
// 键盘事件处理
const handleKeyDown = (event: KeyboardEvent) => {
  switch (event.key) {
    case 'ArrowUp':
      navigateUp();
      break;
    case 'ArrowDown':
      navigateDown();
      break;
    case 'Enter':
      selectCurrent();
      break;
    case 'Escape':
      goBack();
      break;
  }
};
```

### 屏幕阅读器支持
```typescript
// ARIA 标签
<div
  role="img"
  aria-label={`File: ${fileName}, Size: ${formatFileSize(size)}`}
  tabIndex={0}
  onKeyDown={handleKeyDown}
>
  {/* 可视化内容 */}
</div>
```

## 主题和样式

### 主题配置
```typescript
interface Theme {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    success: string;
    warning: string;
    error: string;
  };
  fonts: {
    family: string;
    size: {
      small: string;
      medium: string;
      large: string;
    };
  };
  spacing: {
    small: number;
    medium: number;
    large: number;
  };
}
```

### 响应式设计
```typescript
// 响应式 Hook
export const useResponsive = () => {
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return {
    ...dimensions,
    isMobile: dimensions.width < 768,
    isTablet: dimensions.width >= 768 && dimensions.width < 1024,
    isDesktop: dimensions.width >= 1024
  };
};
```