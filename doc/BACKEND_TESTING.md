# 后端单元测试文档

## 概述

为磁盘扫描器后端添加了全面的单元测试，验证获取指定路径结果的正确性，包括子项是否正确以及子项包含子文件夹和子文件。

## 测试模块结构

### 1. 路径验证测试模块 (`disk_scanner_tests::path_validation_tests`)

包含以下测试用例：

#### `test_get_directory_children_root_path`
- **目的**: 验证根目录子项获取的正确性
- **验证内容**:
  - 返回正确数量的子项
  - 子项包含预期的文件和目录
  - 文件大小信息正确

#### `test_get_directory_children_nested_path`
- **目的**: 验证嵌套路径子项获取的正确性
- **验证内容**:
  - Documents目录包含Projects子目录和notes.txt文件
  - Projects目录包含ProjectA子目录
  - 所有子项的类型和路径信息正确

#### `test_get_directory_children_with_depth_level_1`
- **目的**: 验证深度级别1的目录子项获取
- **验证内容**:
  - Documents目录下正确获取Projects子目录
  - Projects子目录下包含正确的文件结构
  - 深度限制正常工作

#### `test_get_directory_children_with_depth_level_2`
- **目的**: 验证深度级别2的目录子项获取
- **验证内容**:
  - 更深层次的目录结构正确获取
  - ProjectA目录下的Python文件正确识别
  - 递归深度控制准确

#### `test_get_directory_children_with_depth_level_3`
- **目的**: 验证深度级别3的目录子项获取
- **验证内容**:
  - 最大深度下的完整目录树结构
  - 所有层级的文件和目录都正确包含
  - 深度限制的边界情况处理

#### `test_get_directory_children_with_depth_accuracy`
- **目的**: 验证目录信息获取的准确性
- **验证内容**:
  - 目录名称、路径信息正确
  - 子项数量统计准确
  - 目录类型标识正确

#### `test_build_directory_cache_accuracy`
- **目的**: 验证缓存构建的准确性
- **验证内容**:
  - 缓存构建成功完成
  - 缓存中的目录信息可通过公共API访问
  - 缓存数据与实际目录结构一致

#### `test_empty_directory_handling`
- **目的**: 验证空目录的处理
- **验证内容**:
  - 空目录的子项列表为空
  - 空目录的信息获取不报错
  - 正确处理边界情况

#### `test_directory_size_calculation_with_nested_structure`
- **目的**: 验证嵌套结构的目录大小计算
- **验证内容**:
  - 正确计算包含多层子目录的目录大小
  - 验证父目录大小等于所有子项大小之和

#### `test_directory_size_calculation_single_level`
- **目的**: 验证单层目录大小计算
- **验证内容**:
  - 正确计算单层目录下的文件总大小

#### `test_directory_size_with_empty_subdirectories`
- **目的**: 验证包含空子目录的大小计算
- **验证内容**:
  - 空子目录大小为0
  - 不影响父目录大小计算

#### `test_max_depth_zero_returns_only_files`
- **目的**: 验证深度为0时的行为
- **验证内容**:
  - 只返回文件，不返回子目录
  - 但仍正确计算包含子目录的总大小

#### `test_file_path_errors`
- **目的**: 验证文件路径的错误处理
- **验证内容**:
  - 对文件路径（非目录）返回适当的错误信息
  - 错误类型和消息准确

## 测试辅助函数

### `create_test_directory_structure()`
创建一个复杂的测试目录结构，包含：
- 多个顶级目录（Documents, Images, Videos）
- 嵌套子目录结构
- 各种文件类型（文本文件、JSON配置、Python脚本等）
- 不同大小的文件内容

### `validate_file_node()`
验证文件节点的属性：
- 名称匹配
- 路径存在且正确
- 文件类型标识准确
- 大小信息合理

### `validate_directory_node()`
验证目录节点的属性：
- 名称匹配
- 路径存在且正确
- 子项数量统计准确
- 子项名称列表完整

## 运行测试

### 运行所有测试
```bash
cd src-tauri
cargo test
```

### 运行特定测试模块
```bash
cd src-tauri
cargo test path_validation_tests
```

### 运行单个测试
```bash
cd src-tauri
cargo test test_get_directory_info_accuracy
```

### 带调试输出运行
```bash
cd src-tauri
cargo test path_validation_tests -- --nocapture
```

## 测试覆盖率

测试覆盖了以下关键功能：

1. **路径验证**: 正确解析和验证各种路径格式
2. **子项获取**: 准确获取目录的直接子项
3. **深度控制**: 正确处理不同深度的递归获取
4. **类型识别**: 正确区分文件和目录
5. **错误处理**: 优雅处理不存在路径和文件路径
6. **缓存机制**: 验证缓存构建和信息获取
7. **边界情况**: 处理空目录和嵌套结构

## 注意事项

1. 目录大小计算可能为0，这是由于内部的`MIN_SIZE_THRESHOLD`过滤机制
2. 测试使用临时目录，确保测试之间不会相互影响
3. 并行处理测试，提高测试执行效率
4. 所有测试都包含适当的清理逻辑

## 持续集成

建议将后端测试集成到CI/CD流程中，确保：
- 每次代码提交都运行完整的测试套件
- 新增功能都伴随相应的测试用例
- 测试结果作为代码质量的重要指标
