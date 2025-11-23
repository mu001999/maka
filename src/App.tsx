import { useState, useEffect, useCallback } from 'react'
import {
  FolderOpen,
  RefreshCw,
  ArrowLeft,
  PieChart,
  LayoutGrid,
  HardDrive,
  AlertCircle,
  FileText,
  Folder
} from 'lucide-react'
import './App.css'
import SunburstChart from './components/SunburstChart'
import TreemapChart from './components/TreemapChart'

// Title Bar Component
const TitleBar = () => {
  const [isTauri, setIsTauri] = useState(false)

  useEffect(() => {
    setIsTauri(!!window.__TAURI__)
  }, [])

  const handleMinimize = async () => {
    if (isTauri) {
      try {
        const { getCurrent } = await import('@tauri-apps/api/window')
        await getCurrent().minimize()
      } catch (error) {
        console.warn('Failed to minimize window:', error)
      }
    }
  }

  const handleMaximize = async () => {
    if (isTauri) {
      try {
        const { getCurrent } = await import('@tauri-apps/api/window')
        await getCurrent().toggleMaximize()
      } catch (error) {
        console.warn('Failed to maximize window:', error)
      }
    }
  }

  const handleClose = async () => {
    if (isTauri) {
      try {
        const { getCurrent } = await import('@tauri-apps/api/window')
        await getCurrent().close()
      } catch (error) {
        console.warn('Failed to close window:', error)
      }
    }
  }

  if (!isTauri) return null

  return (
    <div className="title-bar">
      <div className="title-bar-controls">
        <button className="traffic-light close" onClick={handleClose} />
        <button className="traffic-light minimize" onClick={handleMinimize} />
        <button className="traffic-light maximize" onClick={handleMaximize} />
      </div>
    </div>
  )
}

// Wrapper function for Tauri invoke
async function invoke<T>(cmd: string, args?: any): Promise<T> {
  try {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/tauri')
    return await tauriInvoke<T>(cmd, args)
  } catch (error) {
    console.error(`=== [Frontend] Error invoking Tauri command ${cmd}:`, error)
    throw error
  }
}

interface FileNode {
  name: string
  path: string
  size: number
  is_directory: boolean
  children: FileNode[]
  children_count: number
  show: boolean
}

function App() {
  const [currentPath, setCurrentPath] = useState<string>('')
  const [currentData, setCurrentData] = useState<FileNode | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'sunburst' | 'treemap'>('sunburst')
  const [maxDepth, setMaxDepth] = useState<number>(2)
  const [isTauri, setIsTauri] = useState<boolean>(false)
  const [errorStats, setErrorStats] = useState<{ permission_errors: number, not_found_errors: number } | null>(null)
  const [isInitialized, setIsInitialized] = useState<boolean>(false)
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null)

  useEffect(() => {
    setIsTauri(!!window.__TAURI__)
  }, [])

  const buildCache = useCallback(async (path: string) => {
    setLoading(true)
    setError('')
    try {
      await invoke<string>('build_cache', { path })
    } catch (err) {
      setError(`Failed to build cache: ${err}`)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDirectoryChildrenWithDepth = useCallback(async (path: string, depth: number = 2) => {
    setLoading(true)
    setError(null)
    try {
      const root_node = await invoke<FileNode>('get_result_with_depth', {
        path,
        maxDepth: depth
      })
      setCurrentPath(path)
      setCurrentData(root_node)
      setSelectedNode(root_node)
    } catch (err) {
      setError(`Failed to load directory children: ${err}`)
      setCurrentPath(path)
      setCurrentData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const getErrorStatistics = useCallback(async () => {
    try {
      const stats = await invoke<{ permission_errors: number, not_found_errors: number }>('get_error_stats')
      setErrorStats(stats)
    } catch (statsError) {
      console.warn('Failed to get error stats:', statsError)
    }
  }, [])

  const handleDirectorySelect = useCallback(async () => {
    if (!isTauri) {
      setError('Tauri is not available. Run in Tauri environment.')
      return
    }

    try {
      const hasAccess = await invoke<boolean>('request_disk_access')
      if (!hasAccess) {
        setError('Disk access denied. Please grant Full Disk Access.')
        return
      }

      const selectedPath = await invoke<string | null>('select_directory')
      if (selectedPath) {
        await buildCache(selectedPath)
        await loadDirectoryChildrenWithDepth(selectedPath, maxDepth)
        await getErrorStatistics()
      }
    } catch (err) {
      setError(`Failed to select directory: ${err}`)
    }
  }, [isTauri, buildCache, loadDirectoryChildrenWithDepth, getErrorStatistics])


  const handleNodeHover = useCallback((node: FileNode) => {
    setSelectedNode(node)
  }, [])

  const handleNodeClick = useCallback(async (node: FileNode) => {
    setSelectedNode(node)
    if (node.is_directory) {
      await loadDirectoryChildrenWithDepth(node.path, maxDepth)
      await getErrorStatistics()
    }
  }, [loadDirectoryChildrenWithDepth, getErrorStatistics, maxDepth])

  const handleGoBack = useCallback(async () => {
    if (currentPath && currentPath !== '/') {
      const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/'
      await loadDirectoryChildrenWithDepth(parentPath, maxDepth)
      await getErrorStatistics()
    }
  }, [currentPath, loadDirectoryChildrenWithDepth, getErrorStatistics])

  const handleRefresh = useCallback(async () => {
    if (currentPath) {
      try {
        await invoke('reset_error_stats')
        setErrorStats({ permission_errors: 0, not_found_errors: 0 })
      } catch (e) { console.warn(e) }
      await loadDirectoryChildrenWithDepth(currentPath, maxDepth)
      await getErrorStatistics()
    }
  }, [currentPath, loadDirectoryChildrenWithDepth, getErrorStatistics])

  // Initial load
  useEffect(() => {
    const initializeApp = async () => {
      if (isInitialized) return
      setIsInitialized(true)

      if (window.__TAURI__) {
        try {
          const drives = await invoke<string[]>('get_system_drives')
          if (drives && drives.length > 0) {
            const rootPath = drives[0]
            await buildCache(rootPath)
            await loadDirectoryChildrenWithDepth(rootPath, maxDepth)
            await getErrorStatistics()
          }
        } catch (err) {
          setError(`Failed to initialize: ${err}`)
        }
      }
    }
    // initializeApp()
  }, [isInitialized, buildCache, loadDirectoryChildrenWithDepth, getErrorStatistics])

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className={`app-container ${isTauri ? 'tauri-active' : ''}`}>
      <TitleBar />

      {/* Sidebar */}
      <div className="sidebar" style={{ paddingTop: isTauri ? '48px' : '16px' }}>
        <div className="sidebar-header">
          <div className="app-title flex items-center gap-2">
            <HardDrive className="w-6 h-6 text-blue-500" />
            <span>Maka</span>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-title">Navigation</div>
          <button onClick={handleDirectorySelect} className="btn btn-primary">
            <FolderOpen size={16} />
            Select Directory
          </button>
          <button
            onClick={handleGoBack}
            disabled={!currentPath || currentPath === '/'}
            className="btn btn-secondary"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <button
            onClick={handleRefresh}
            disabled={!currentPath}
            className="btn btn-secondary"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        <div className="sidebar-section">
          <div className="section-title">View Mode</div>
          <div className="flex gap-2">
            <button
              className={`btn-icon ${viewMode === 'sunburst' ? 'active' : ''}`}
              onClick={() => setViewMode('sunburst')}
              title="Sunburst Chart"
            >
              <PieChart size={20} />
            </button>
            <button
              className={`btn-icon ${viewMode === 'treemap' ? 'active' : ''}`}
              onClick={() => setViewMode('treemap')}
              title="Treemap Chart"
            >
              <LayoutGrid size={20} />
            </button>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-title">Scan Depth: {maxDepth}</div>
          <div className="depth-control">
            <input
              type="range"
              min="1"
              max="10"
              value={maxDepth}
              onChange={(e) => setMaxDepth(parseInt(e.target.value))}
              onMouseUp={async () => {
                if (currentPath) {
                  await buildCache(currentPath)
                  await loadDirectoryChildrenWithDepth(currentPath, maxDepth)
                  await getErrorStatistics()
                }
              }}
            />
          </div>
        </div>

        {errorStats && (errorStats.permission_errors > 0 || errorStats.not_found_errors > 0) && (
          <div className="error-banner">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={16} />
              <span className="font-semibold">Scan Issues</span>
            </div>
            <div className="text-xs opacity-80">
              {errorStats.permission_errors > 0 && <div>Permission denied: {errorStats.permission_errors}</div>}
              {errorStats.not_found_errors > 0 && <div>Not found: {errorStats.not_found_errors}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="main-content" style={{ paddingTop: isTauri ? '32px' : '0' }}>
        <div className="content-header">
          <div className="path-breadcrumb" title={currentPath}>
            {currentPath || 'No directory selected'}
          </div>
        </div>

        <div className="visualization-area">
          {error && (
            <div className="absolute top-4 right-4 z-50 bg-red-500 text-white p-4 rounded-lg shadow-lg">
              {error}
            </div>
          )}

          <div className="chart-wrapper">
            {loading && (
              <div className="loading-overlay">
                <div className="spinner mb-4"></div>
                <div className="text-sm text-gray-400">Scanning directory structure...</div>
              </div>
            )}

            {!currentData ? (
              <div className="empty-state">
                <FolderOpen className="empty-icon" />
                <h3>No Data to Display</h3>
                <p>Select a directory to start analyzing disk usage</p>
              </div>
            ) : (
              <div className="chart-view">
                {viewMode === 'sunburst' ? (
                  <SunburstChart
                    data={currentData}
                    onNodeClick={handleNodeClick}
                    onNodeHover={handleNodeHover}
                  />
                ) : (
                  <TreemapChart
                    data={currentData}
                    onNodeClick={handleNodeClick}
                    onNodeHover={handleNodeHover}
                  />
                )}
              </div>
            )}
          </div>

          {/* Info Panel */}
          <div className="info-sidebar">
            <div className="info-card">
              <h3 className="text-lg font-bold mb-4 text-white">Details</h3>
              {selectedNode ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3 mb-2">
                    {selectedNode.is_directory ? (
                      <Folder className="w-8 h-8 text-blue-500" />
                    ) : (
                      <FileText className="w-8 h-8 text-gray-400" />
                    )}
                    <div className="overflow-hidden">
                      <div className="font-semibold truncate" title={selectedNode.name}>
                        {selectedNode.name}
                      </div>
                      <div className="text-xs text-gray-400 truncate" title={selectedNode.path}>
                        {selectedNode.path}
                      </div>
                    </div>
                  </div>

                  <div className="stat-item">
                    <span className="stat-label">Size</span>
                    <span className="stat-value">{formatSize(selectedNode.size)}</span>
                  </div>

                  {selectedNode.is_directory && (
                    <div className="stat-item">
                      <span className="stat-label">Items</span>
                      <span className="stat-value">{selectedNode.children_count || 0}</span>
                    </div>
                  )}

                  <div className="stat-item">
                    <span className="stat-label">Type</span>
                    <span className="stat-value">
                      {selectedNode.is_directory ? 'Directory' : 'File'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <p>Select an item to view details</p>
                </div>
              )}
            </div>

            {selectedNode && selectedNode.children.length > 0 && (
              <div className="info-card flex-1 overflow-hidden flex flex-col">
                <h3 className="text-sm font-bold mb-3 text-gray-400 uppercase tracking-wider">
                  Top Items
                </h3>
                <div className="overflow-y-auto flex-1 pr-2 space-y-2">
                  {selectedNode.children
                    .sort((a, b) => b.size - a.size)
                    .slice(0, 10)
                    .map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded hover:bg-white/5 cursor-pointer transition-colors"
                        onClick={() => handleNodeClick(item)}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className={`w-2 h-2 rounded-full ${item.is_directory ? 'bg-blue-500' : 'bg-gray-500'}`} />
                          <span className="text-sm truncate">{item.name}</span>
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {formatSize(item.size)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
