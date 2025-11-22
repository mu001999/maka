import { useState, useEffect, useCallback } from 'react'

// Title Bar Component
const TitleBar = () => {
  const [isTauri, setIsTauri] = useState(false)

  useEffect(() => {
    // Check if we're running in Tauri environment
    setIsTauri(!!window.__TAURI__)
  }, [])

  const handleMinimize = async () => {
    if (isTauri) {
      try {
        const { getCurrent } = await import('@tauri-apps/api/window')
        const appWindow = getCurrent()
        await appWindow.minimize()
      } catch (error) {
        console.warn('Failed to minimize window:', error)
      }
    }
  }

  const handleMaximize = async () => {
    if (isTauri) {
      try {
        const { getCurrent } = await import('@tauri-apps/api/window')
        const appWindow = getCurrent()
        await appWindow.toggleMaximize()
      } catch (error) {
        console.warn('Failed to maximize window:', error)
      }
    }
  }

  const handleClose = async () => {
    if (isTauri) {
      try {
        const { getCurrent } = await import('@tauri-apps/api/window')
        const appWindow = getCurrent()
        await appWindow.close()
      } catch (error) {
        console.warn('Failed to close window:', error)
      }
    }
  }

  // Don't show title bar in browser environment
  if (!isTauri) {
    return null
  }

  return (
    <div className="title-bar">
      <div className="title-bar-title">Maka - Disk Usage Analyzer</div>
      <div className="title-bar-controls">
        <button
          className="title-bar-button minimize"
          onClick={handleMinimize}
          aria-label="Minimize"
        />
        <button
          className="title-bar-button maximize"
          onClick={handleMaximize}
          aria-label="Maximize"
        />
        <button
          className="title-bar-button close"
          onClick={handleClose}
          aria-label="Close"
        />
      </div>
    </div>
  )
}
// Wrapper function for Tauri invoke - no fallback, only real backend data
async function invoke<T>(cmd: string, args?: any): Promise<T> {
  console.log(`=== [Frontend] Invoking command: ${cmd}`, args)

  try {
    // Try to import and use the official Tauri API
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/tauri')
    const result = await tauriInvoke<T>(cmd, args)
    console.log(`=== [Frontend] Command ${cmd} result:`, result)
    console.log(`=== [Frontend] Successfully connected to REAL backend!`)
    return result
  } catch (error) {
    console.error(`=== [Frontend] Error invoking Tauri command ${cmd}:`, error)
    throw error
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

function App() {
  const [currentPath, setCurrentPath] = useState<string>('')
  const [currentData, setCurrentData] = useState<FileNode[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'sunburst' | 'treemap'>('sunburst')
  const [cacheBuilt, setCacheBuilt] = useState<boolean>(false)
  const [maxDepth, setMaxDepth] = useState<number>(3)
  const [isTauri, setIsTauri] = useState<boolean>(false)
  const [errorStats, setErrorStats] = useState<{permission_errors: number, not_found_errors: number} | null>(null)
  const [isInitialized, setIsInitialized] = useState<boolean>(false)

  // Check if running in Tauri environment
  useEffect(() => {
    setIsTauri(!!window.__TAURI__)
  }, [])

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

  // Load directory children with depth - 使用真实后端数据
  const loadDirectoryChildrenWithDepth = useCallback(async (path: string, depth: number = 2) => {
    console.log('=== [Frontend] Loading children with depth for path:', path, 'depth:', depth)

    setLoading(true)
    setError(null)

    try {
      // 使用新的API一次性获取指定深度的完整数据结构
      const children = await invoke<FileNode[]>('get_directory_children_with_depth', {
        path,
        maxDepth: depth
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

  // Check if Tauri is available
  const checkTauriAvailability = useCallback(() => {
    const isAvailable = typeof window !== 'undefined' && (window as any).__TAURI__ !== undefined
    setIsTauri(isAvailable)
    return isAvailable
  }, [])

  // 获取错误统计信息
  const getErrorStatistics = useCallback(async () => {
    try {
      const stats = await invoke<{permission_errors: number, not_found_errors: number}>('get_error_stats')
      setErrorStats(stats)
      console.log('=== [Frontend] Error stats:', stats)
    } catch (statsError) {
      console.warn('=== [Frontend] Failed to get error stats:', statsError)
    }
  }, [])

  // Handle directory selection - with proper folder picker dialog
  const handleDirectorySelect = useCallback(async () => {
    console.log('=== [Frontend] Opening directory selection dialog...')

    // Check if Tauri is available first
    if (!checkTauriAvailability()) {
      setError('Tauri is not available. This application must be run in a Tauri environment to access real disk data.')
      return
    }

    try {
      // First request disk access (returns boolean)
      const hasAccess = await invoke<boolean>('request_disk_access')
      console.log('=== [Frontend] Disk access result:', hasAccess)

      if (!hasAccess) {
        console.warn('=== [Frontend] Disk access denied')
        setError('Disk access denied. Please grant Full Disk Access in System Preferences.')
        return
      }

      // Open directory selection dialog
      console.log('=== [Frontend] Opening directory selection dialog...')
      const selectedPath = await invoke<Option<string>>('select_directory')
      console.log('=== [Frontend] Directory selection result:', selectedPath)

      if (selectedPath) {
        console.log('=== [Frontend] Selected directory:', selectedPath)

        // Build cache for the selected directory
        console.log('=== [Frontend] Building cache for selected directory...')
        await buildCache(selectedPath)
        // Load directory children with depth
        console.log('=== [Frontend] Loading directory children with depth...')
        await loadDirectoryChildrenWithDepth(selectedPath, 2)
        // 选择新目录后获取错误统计
        await getErrorStatistics()
      } else {
        console.log('=== [Frontend] Directory selection cancelled')
        // User cancelled, no error needed
      }
    } catch (err) {
      console.error('=== [Frontend] Failed to select directory:', err)
      setError(`Failed to select directory: ${err}`)
    }
  }, [buildCache, loadDirectoryChildrenWithDepth, checkTauriAvailability, getErrorStatistics])

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
      // 导航后获取错误统计
      await getErrorStatistics()
    } else {
      console.log('=== [Frontend] Clicked on file (no action):', node.name, 'size:', node.size)
    }
  }, [loadDirectoryChildrenWithDepth, getErrorStatistics])

  // Handle back navigation
  const handleGoBack = useCallback(async () => {
    if (currentPath && currentPath !== '/') {
      const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/'
      console.log('=== [Frontend] Going back from', currentPath, 'to', parentPath)
      await loadDirectoryChildrenWithDepth(parentPath, 2)
      // 返回后获取错误统计
      await getErrorStatistics()
    }
  }, [currentPath, loadDirectoryChildrenWithDepth, getErrorStatistics])

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    if (currentPath) {
      console.log('=== [Frontend] Refreshing current path:', currentPath)
      // 重置错误统计
      try {
        await invoke('reset_error_stats')
        setErrorStats({permission_errors: 0, not_found_errors: 0})
        console.log('=== [Frontend] Error stats reset')
      } catch (statsError) {
        console.warn('=== [Frontend] Failed to reset error stats:', statsError)
      }
      await loadDirectoryChildrenWithDepth(currentPath, 2)
      // 刷新后获取错误统计
      await getErrorStatistics()
    }
  }, [currentPath, loadDirectoryChildrenWithDepth, getErrorStatistics])

  // Initialize with system drives
  useEffect(() => {
    const initializeApp = async () => {
      // 防止重复初始化
      if (isInitialized) {
        console.log('=== [Frontend] App already initialized, skipping...')
        return
      }

      // 标记初始化完成
      setIsInitialized(true)

      console.log('=== [Frontend] Initializing app...')

      // First check if Tauri is available
      if (!checkTauriAvailability()) {
        console.error('=== [Frontend] Tauri is not available!')
        setError('Tauri is not available. This application must be run in a Tauri environment to access real disk data.')
        return
      }

      try {
        console.log('=== [Frontend] Getting system drives...')
        const drives = await invoke<string[]>('get_system_drives')
        console.log('=== [Frontend] System drives:', drives)

        if (drives && drives.length > 0) {
          const rootPath = drives[0]
          console.log('=== [Frontend] Using root path:', rootPath)

          // Build cache for the root directory
          console.log('=== [Frontend] Building cache for root directory...')
          await buildCache(rootPath)

          // Load root directory children with depth
          console.log('=== [Frontend] Loading root directory children with depth...')
          await loadDirectoryChildrenWithDepth(rootPath, 2)

          // 初始化完成后获取错误统计
          await getErrorStatistics()
        }
      } catch (err) {
        console.error('=== [Frontend] Failed to initialize app:', err)
        setError(`Failed to initialize app: ${err}`)
      }
    }

    // initializeApp()
  }, [buildCache, loadDirectoryChildrenWithDepth, checkTauriAvailability, isInitialized])

  return (
    <div className={`app-container bg-gray-50 ${isTauri ? 'tauri-active' : ''}`}>
      <TitleBar />
      <div className="main-content">
        <div className="h-full flex flex-col">
          <div className="flex-shrink-0 px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold text-gray-900">
                Disk Usage Visualizer
              </h1>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleDirectorySelect}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                >
                  Select Directory
                </button>
                <button
                  onClick={handleGoBack}
                  disabled={!currentPath || currentPath === '/'}
                  className="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-400 transition-colors text-sm"
                >
                  Back
                </button>
                <button
                  onClick={handleRefresh}
                  disabled={!currentPath}
                  className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors text-sm"
                >
                  Refresh
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-3 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md text-sm">
                {error}
              </div>
            )}

            {loading && (
              <div className="mb-3 p-3 bg-blue-100 border border-blue-400 text-blue-700 rounded-md text-sm">
                Loading directory data...
              </div>
            )}

            {cacheBuilt && (
              <div className="mb-3 p-3 bg-green-100 border border-green-400 text-green-700 rounded-md text-sm">
                Directory cache built successfully!
              </div>
            )}

            {errorStats && (errorStats.permission_errors > 0 || errorStats.not_found_errors > 0) && (
              <div className="mb-3 p-3 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded-md text-sm">
                <div className="font-medium">Scanning Issues:</div>
                <div className="text-xs mt-1">
                  {errorStats.permission_errors > 0 && (
                    <span>Permission denied: {errorStats.permission_errors} files/directories</span>
                  )}
                  {errorStats.permission_errors > 0 && errorStats.not_found_errors > 0 && <br />}
                  {errorStats.not_found_errors > 0 && (
                    <span>File not found: {errorStats.not_found_errors} files/directories</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex-shrink-0 mb-3">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-800">
                  Current Path: {currentPath || 'None'}
                </h2>
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700">View:</label>
                    <select
                      value={viewMode}
                      onChange={(e) => setViewMode(e.target.value as 'sunburst' | 'treemap')}
                      className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="sunburst">Sunburst</option>
                      <option value="treemap">Treemap</option>
                    </select>
                  </div>
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700">Depth:</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={maxDepth}
                      onChange={(e) => setMaxDepth(parseInt(e.target.value))}
                      className="px-2 py-1 border border-gray-300 rounded-md text-sm w-12"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {currentData && currentData.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 h-full flex flex-col">
                  <div className="flex-shrink-0 mb-3">
                    <h3 className="text-base font-medium text-gray-800 mb-1">
                      Directory Contents ({currentData.length} items)
                    </h3>
                    <div className="text-xs text-gray-600">
                      Total size: {(currentData.reduce((sum, item) => sum + item.size, 0) / 1024 / 1024 / 1024).toFixed(2)} GB
                    </div>
                  </div>

                  <div className="grid-container flex-1">
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <h4 className="text-sm font-medium text-gray-800 mb-2">
                        {viewMode === 'sunburst' ? 'Sunburst Chart' : 'Treemap Chart'}
                        {viewMode === 'treemap' && currentPath && (
                          <span className="text-xs text-gray-500 ml-2">
                            (Showing root directory contents)
                          </span>
                        )}
                      </h4>
                      <div className="chart-container">
                        {viewMode === 'sunburst' ? (
                          <SunburstChart
                            data={currentData}
                            onNodeClick={handleNodeClick}
                          />
                        ) : (
                          <TreemapChart
                            data={currentData}
                            onNodeClick={handleNodeClick}
                          />
                        )}
                      </div>
                    </div>

                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <h4 className="text-sm font-medium text-gray-800 mb-2">Directory List</h4>
                      <div className="directory-list-container">
                        <div className="space-y-1">
                          {currentData.map((item, index) => (
                            <div
                              key={index}
                              className={`p-2 rounded-md border cursor-pointer transition-colors text-sm ${
                                item.is_directory
                                  ? 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                              }`}
                              onClick={() => handleNodeClick(item)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <div className={`w-3 h-3 rounded ${
                                    item.is_directory ? 'bg-blue-500' : 'bg-gray-400'
                                  }`}></div>
                                  <div>
                                    <div className="font-medium text-gray-900 text-sm">
                                      {item.name}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {item.path}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs font-medium text-gray-900">
                                    {(item.size / 1024 / 1024).toFixed(2)} MB
                                  </div>
                                  {item.is_directory && (
                                    <div className="text-xs text-gray-500">
                                      {item.children_count || 0} items
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {(!currentData || currentData.length === 0) && !loading && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-gray-500 mb-3 text-sm">
                      No directory data available
                    </div>
                    <button
                      onClick={handleDirectorySelect}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                    >
                      Select a Directory to Start
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
