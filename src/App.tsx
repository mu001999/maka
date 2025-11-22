import { useState, useEffect, useCallback } from 'react'
// Tauri invoke wrapper with fallback
async function invoke<T>(cmd: string, args?: any): Promise<T> {
  console.log(`=== [Frontend] Invoking command: ${cmd}`, args)

  try {
    // Try to import and use the official Tauri API
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/tauri')
    const result = await tauriInvoke(cmd, args)
    console.log(`=== [Frontend] Command ${cmd} result:`, result)
    console.log(`=== [Frontend] Successfully connected to REAL backend!`)
    return result
  } catch (error) {
    console.log('=== [Frontend] Tauri API error, using fallback data...')
    console.log('=== [Frontend] Error details:', error)

    // Fallback for development/testing
    if (cmd === 'get_system_drives') {
      console.log('=== [Frontend] Using fallback for get_system_drives')
      return ['/'] as T
    } else if (cmd === 'build_directory_cache') {
      console.log('=== [Frontend] Using fallback for build_directory_cache')
      return 'Cache built successfully' as T
    } else if (cmd === 'get_directory_children') {
      console.log('=== [Frontend] Using MOCK data for get_directory_children')
      // Return mock data for development
      const mockData = [
        {
          name: 'Applications',
          path: '/Applications',
          size: 17040439975,
          is_directory: true,
          children: [],
          children_count: 0
        },
        {
          name: 'Users',
          path: '/Users',
          size: 1521820080,
          is_directory: true,
          children: [],
          children_count: 0
        },
        {
          name: 'System',
          path: '/System',
          size: 3118219,
          is_directory: true,
          children: [],
          children_count: 0
        },
        {
          name: 'Library',
          path: '/Library',
          size: 19077179226,
          is_directory: true,
          children: [],
          children_count: 0
        },
        {
          name: 'var',
          path: '/var',
          size: 6777037613,
          is_directory: true,
          children: [],
          children_count: 0
        }
      ]
      console.log('=== [Frontend] Returning mock data with', mockData.length, 'items')
      return mockData as T
    } else if (cmd === 'get_directory_children_with_depth') {
      console.log('=== [Frontend] Using MOCK data for get_directory_children_with_depth')
      // Return mock data for development with nested structure
      const mockData = [
        {
          name: 'Applications',
          path: '/Applications',
          size: 17040439975,
          is_directory: true,
          children: [
            {
              name: 'Safari.app',
              path: '/Applications/Safari.app',
              size: 100000000,
              is_directory: true,
              children: [],
              children_count: 0
            },
            {
              name: 'Chrome.app',
              path: '/Applications/Chrome.app',
              size: 200000000,
              is_directory: true,
              children: [],
              children_count: 0
            }
          ],
          children_count: 2
        },
        {
          name: 'Users',
          path: '/Users',
          size: 1521820080,
          is_directory: true,
          children: [
            {
              name: 'Shared',
              path: '/Users/Shared',
              size: 500000000,
              is_directory: true,
              children: [],
              children_count: 0
            }
          ],
          children_count: 1
        },
        {
          name: 'System',
          path: '/System',
          size: 3118219,
          is_directory: true,
          children: [],
          children_count: 0
        },
        {
          name: 'Library',
          path: '/Library',
          size: 19077179226,
          is_directory: true,
          children: [],
          children_count: 0
        },
        {
          name: 'var',
          path: '/var',
          size: 6777037613,
          is_directory: true,
          children: [],
          children_count: 0
        }
      ]
      console.log('=== [Frontend] Returning mock data with depth for', mockData.length, 'items')
      return mockData as T
    } else if (cmd === 'request_disk_access') {
      console.log('=== [Frontend] Using fallback for request_disk_access')
      return '/' as T
    }
    throw new Error(`Unknown command: ${cmd}`)
  }
}
import './App.css'
import SunburstChart from './components/SunburstChart'
import TreemapChart from './components/TreemapChart'

interface FileNode {
  name: string
  path: string
  size: number
  is_directory: boolean
  children: FileNode[]
  children_count?: number
}

// 暂时注释掉未使用的接口
// interface DirectoryInfo {
//   name: string
//   path: string
//   size: number
//   is_directory: boolean
//   children_count: number
//   children_names: string[]
// }

function App() {
  const [currentPath, setCurrentPath] = useState<string>('')
  const [currentData, setCurrentData] = useState<FileNode[]>([])
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'sunburst' | 'treemap'>('sunburst')
  const [cacheBuilt, setCacheBuilt] = useState<boolean>(false)
  const [maxDepth, setMaxDepth] = useState<number>(3)

  // Build directory cache first
  const buildCache = useCallback(async (path: string) => {
    console.log('=== [Frontend] Building cache for path:', path, 'with maxDepth:', maxDepth)
    setLoading(true)
    setError('')
    try {
      console.log('=== [Frontend] Calling build_directory_cache...')
      const result = await invoke<string>('build_directory_cache', {
        path,
        maxDepth: maxDepth
      })
      console.log('=== [Frontend] Cache built successfully:', result)
      setCacheBuilt(true)
    } catch (err) {
      console.error('=== [Frontend] Failed to build cache:', err)
      setError(`Failed to build cache: ${err}`)
    } finally {
      setLoading(false)
    }
  }, [maxDepth])

  // Load directory children - 使用真实后端数据
  const loadDirectoryChildren = useCallback(async (path: string) => {
    console.log('=== [Frontend] Loading children for path:', path)

    setLoading(true)
    setError(null)

    try {
      console.log('=== [Frontend] Calling get_directory_children_with_depth with path:', path)
      const children = await invoke<FileNode[]>('get_directory_children_with_depth', {
        path,
        max_depth: 2
      })
      console.log('=== [Frontend] Received children from backend:', children)
      console.log('=== [Frontend] Children count:', children?.length || 0)
      console.log('=== [Frontend] First child sample:', children?.[0])

      if (!children || children.length === 0) {
        console.log('=== [Frontend] No children found, setting empty data')
        setCurrentData([])
        setCurrentPath(path)
      } else {
        // Filter out very small files and empty directories
        console.log('=== [Frontend] Filtering children data...')
        const filteredChildren = children.filter(child => {
          if (child.is_directory) {
            // For directories, show all directories regardless of size or children count
            // This ensures users can navigate into empty directories
            console.log(`=== [Frontend] Keeping directory: ${child.name} (size: ${child.size}, children: ${child.children.length})`)
            return true
          } else {
            // For files, only filter out completely empty files (0 bytes)
            const keep = child.size > 0
            if (!keep) {
              console.log(`=== [Frontend] Filtering out empty file: ${child.name} (size: ${child.size})`)
            }
            return keep
          }
        })

        console.log(`=== [Frontend] Filtered from ${children.length} to ${filteredChildren.length} items`)
        setCurrentData(filteredChildren)
        setCurrentPath(path)
      }
    } catch (err) {
      console.error('=== [Frontend] Failed to load directory children:', err)
      setError(`Failed to load directory: ${err}`)
      console.log('=== [Frontend] Setting empty data due to error')
      setCurrentData([])
      setCurrentPath(path)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDirectoryChildrenWithDepth = useCallback(async (path: string, depth: number = 2) => {
    console.log('=== [Frontend] Loading children with depth for path:', path, 'depth:', depth)

    setLoading(true)
    setError(null)

    try {
      // 使用新的API一次性获取指定深度的完整数据结构
      const children = await invoke<FileNode[]>('get_directory_children_with_depth', {
        path,
        max_depth: depth
      })

      setCurrentData(children as FileNode[])
      setCurrentPath(path)
      setError(null)
    } catch (err) {
      console.error('=== [Frontend] Failed to load directory children with depth:', err)
      setError(`Failed to load directory children with depth: ${err}`)
      setCurrentData([])
      setCurrentPath(path)
    } finally {
      setLoading(false)
    }
  }, [])

  // Get directory info - 暂时注释掉未使用的函数
  // const getDirectoryInfo = useCallback(async (path: string) => {
  //   console.log('=== [Frontend] Getting directory info for path:', path)
  //   try {
  //     const info = await invoke<DirectoryInfo>('get_directory_info', { path })
  //     console.log('=== [Frontend] Received directory info:', info)
  //     return info
  //   } catch (err) {
  //     console.error('=== [Frontend] Failed to get directory info:', err)
  //     return null
  //   }
  // }, [])

  // Handle directory selection - 简单版本
  const handleDirectorySelect = async () => {
    console.log('=== [Frontend] Requesting disk access...')
    try {
      const selected = await invoke<string>('request_disk_access')
      console.log('=== [Frontend] Disk access result:', selected)
      if (selected) {
        console.log('=== [Frontend] New directory selected:', selected)
        setSelectedPath(selected)
        // Build cache for the selected directory
        console.log('=== [Frontend] Building cache for selected directory...')
        await buildCache(selected)
        // Load root directory children with depth
        console.log('=== [Frontend] Loading root directory children with depth...')
        await loadDirectoryChildrenWithDepth(selected, 2)
      }
    } catch (err) {
      console.error('=== [Frontend] Failed to select directory:', err)
      setError(`Failed to select directory: ${err}`)
    }
  }

  // Handle node click - 简单版本
  const handleNodeClick = useCallback(async (node: FileNode) => {
    if (node.is_directory) {
      console.log('=== [Frontend] Navigating to directory:', node.path)
      console.log('=== [Frontend] Directory details:', {
        name: node.name,
        size: node.size,
        children_count: node.children_count
      })
      await loadDirectoryChildrenWithDepth(node.path, 2)
    } else {
      console.log('=== [Frontend] Clicked on file (no action):', node.name, 'size:', node.size)
    }
  }, [loadDirectoryChildrenWithDepth])

  // Handle back navigation
  const handleGoBack = async () => {
    if (currentPath === '/' || currentPath === selectedPath) {
      return
    }

    // Go to parent directory
    const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/'
    const actualParentPath = parentPath === '' ? '/' : parentPath

    if (actualParentPath.startsWith(selectedPath) || actualParentPath === '/') {
      await loadDirectoryChildrenWithDepth(actualParentPath, 2)
    }
  }

  // Handle refresh - 简单刷新，后端处理缓存逻辑
  const handleRefresh = async () => {
    console.log('=== [Frontend] Refresh button clicked')
    if (currentPath && selectedPath) {
      console.log('=== [Frontend] Manual refresh triggered')
      console.log('=== [Frontend] Refreshing path:', currentPath)
      await loadDirectoryChildrenWithDepth(currentPath, 2)
    } else {
      console.log('=== [Frontend] Refresh skipped - missing path:', { currentPath, selectedPath })
      // Try to refresh with current path even if selectedPath is missing
      if (currentPath) {
        console.log('=== [Frontend] Trying refresh with currentPath only:', currentPath)
        await loadDirectoryChildrenWithDepth(currentPath, 2)
      }
    }
  }

  // Initialize with system drives
  useEffect(() => {
    console.log('=== [Frontend] Initializing app... ===')
    console.log('=== [Frontend] App component mounted! ===')

    // Add global error handler to catch any frontend errors
    const handleError = (event: ErrorEvent) => {
      console.error('=== [Frontend] Global error caught:', event.error)
      console.error('=== [Frontend] Error message:', event.message)
      console.error('=== [Frontend] Error filename:', event.filename)
      console.error('=== [Frontend] Error lineno:', event.lineno)
    }

    window.addEventListener('error', handleError)

    // Add unhandled promise rejection handler
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('=== [Frontend] Unhandled promise rejection:', event.reason)
    }

    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    // Get system drives and initialize
    const initializeApp = async () => {
      console.log('=== [Frontend] Starting initialization...')
      try {
        console.log('=== [Frontend] Getting system drives...')
        const drives = await invoke<string[]>('get_system_drives')
        console.log('=== [Frontend] System drives:', drives)

        if (drives && drives.length > 0) {
          const rootPath = drives[0]
          console.log('=== [Frontend] Using root path:', rootPath)

          // Build cache for root
          console.log('=== [Frontend] Building cache for root...')
          await buildCache(rootPath)

          // Load root directory
          console.log('=== [Frontend] Loading root directory...')
          await loadDirectoryChildrenWithDepth(rootPath, 2)
        } else {
          console.error('=== [Frontend] No system drives found')
          setError('No system drives found')
        }
      } catch (err) {
        console.error('=== [Frontend] Failed to initialize app:', err)
        setError(`Failed to initialize: ${err}`)
      }
    }

    // Add a small delay to ensure everything is ready
    setTimeout(() => {
      console.log('=== [Frontend] Starting initialization after delay...')
      initializeApp()
    }, 1000)

    // Cleanup event listeners
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Maka - Disk Usage Analyzer</h1>
        <div className="controls">
          <button onClick={handleDirectorySelect} disabled={loading}>
            {loading ? 'Scanning...' : 'Select Directory'}
          </button>
          <button onClick={handleRefresh} disabled={loading || !selectedPath}>
            Refresh
          </button>
          <button onClick={handleGoBack} disabled={loading || currentPath === selectedPath}>
            Back
          </button>
          <select
            value={maxDepth}
            onChange={(e) => setMaxDepth(Number(e.target.value))}
            disabled={loading}
          >
            <option value={2}>Depth: 2</option>
            <option value={3}>Depth: 3</option>
            <option value={4}>Depth: 4</option>
            <option value={5}>Depth: 5</option>
          </select>
          <div className="view-toggle">
            <button
              className={viewMode === 'sunburst' ? 'active' : ''}
              onClick={() => setViewMode('sunburst')}
            >
              Sunburst
            </button>
            <button
              className={viewMode === 'treemap' ? 'active' : ''}
              onClick={() => setViewMode('treemap')}
            >
              Treemap
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {!cacheBuilt && loading && (
          <div className="loading">
            <p>Building directory cache...</p>
            <p className="loading-subtext">This may take a while for large directories</p>
          </div>
        )}

        {cacheBuilt && loading && (
          <div className="loading">
            <p>Loading directory contents...</p>
            <p className="loading-subtext">Path: {currentPath}</p>
          </div>
        )}

        {!loading && (
          <>
            <div className="current-path">
              <strong>Current Path:</strong> {currentPath}
              <br />
              <strong>Items:</strong> {currentData.length}
            </div>

            {currentData.length > 0 ? (
              viewMode === 'sunburst' ? (
                <SunburstChart
                  data={currentData}
                  onNodeClick={handleNodeClick}
                  width={800}
                  height={800}
                />
              ) : (
                <TreemapChart
                  data={currentData}
                  onNodeClick={handleNodeClick}
                  width={800}
                  height={600}
                />
              )
            ) : (
              <div className="empty-state">
                <p>No items to display</p>
                <p className="loading-subtext">Current data array is empty</p>
              </div>
            )}
          </>
        )}

        {!loading && currentData.length === 0 && (
          <div className="empty-state">
            <p>No data to display</p>
            <p className="loading-subtext">Select a directory to start analyzing disk usage</p>
          </div>
        )}
      </main>
    </div>
  )
}





export default App
