import React, { useState, useEffect, useCallback } from 'react'
import {
  FolderOpen,
  RefreshCw,
  ArrowLeft,
  PieChart,
  LayoutGrid,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  X,
  ShieldAlert,
  File
} from 'lucide-react'
import './App.css'
import SunburstChart from './components/SunburstChart'
import TreemapChart from './components/TreemapChart'

// Wrapper function for Tauri invoke
async function invoke<T>(cmd: string, args?: any): Promise<T> {
  try {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
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
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null)
  const [copied, setCopied] = useState(false)
  const [hasDiskAccess, setHasDiskAccess] = useState<boolean | null>(null)
  const [itemsToDelete, setItemsToDelete] = useState<FileNode[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy path:', err)
    }
  }, [])

  useEffect(() => {
    checkDiskAccess()
  }, [])

  const checkDiskAccess = async () => {
    try {
      const { checkFullDiskAccessPermission } = await import('tauri-plugin-macos-permissions-api')
      const hasAccess = await checkFullDiskAccessPermission()
      setHasDiskAccess(hasAccess)
    } catch (err) {
      console.error('Failed to check disk access:', err)
    }
  }

  const handleOpenPrivacy = async () => {
    try {
      const { requestFullDiskAccessPermission } = await import('tauri-plugin-macos-permissions-api')
      await requestFullDiskAccessPermission()
    } catch (err) {
      console.error('Failed to open privacy settings:', err)
    }
  }

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

  const handleDirectorySelect = useCallback(async () => {
    try {
      const { checkFullDiskAccessPermission } = await import('tauri-plugin-macos-permissions-api')
      const hasAccess = await checkFullDiskAccessPermission()
      setHasDiskAccess(hasAccess)
      if (!hasAccess) {
        setError('Disk access denied. Please grant Full Disk Access.')
        return
      }

      const selectedPath = await invoke<string | null>('select_directory')
      if (selectedPath) {
        await buildCache(selectedPath)
        await loadDirectoryChildrenWithDepth(selectedPath, maxDepth)
      }
    } catch (err) {
      setError(`Failed to select directory: ${err}`)
    }
  }, [buildCache, loadDirectoryChildrenWithDepth])


  const handleNodeHover = useCallback((node: FileNode) => {
    setSelectedNode(node)
  }, [])

  const handleNodeClick = useCallback(async (node: FileNode) => {
    setSelectedNode(node)
    if (node.is_directory) {
      await loadDirectoryChildrenWithDepth(node.path, maxDepth)
    }
  }, [loadDirectoryChildrenWithDepth, maxDepth])

  const handleGoBack = useCallback(async () => {
    if (currentPath && currentPath !== '/') {
      const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/'
      await loadDirectoryChildrenWithDepth(parentPath, maxDepth)

    }
  }, [currentPath, loadDirectoryChildrenWithDepth])

  const handleRefresh = useCallback(async () => {
    if (currentPath) {
      await loadDirectoryChildrenWithDepth(currentPath, maxDepth)
    }
  }, [currentPath, loadDirectoryChildrenWithDepth, maxDepth])

  const handleBreadcrumbClick = async (path: string) => {
    await loadDirectoryChildrenWithDepth(path, maxDepth)
  }

  // Delete Zone Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(false)
    try {
      const nodeData = JSON.parse(e.dataTransfer.getData('application/json')) as FileNode
      if (!itemsToDelete.some(item => item.path === nodeData.path)) {
        setItemsToDelete(prev => [...prev, nodeData])
      }
    } catch (err) {
      console.error('Failed to parse dropped item:', err)
    }
  }

  const handleRemoveFromDeleteList = (path: string) => {
    setItemsToDelete(prev => prev.filter(item => item.path !== path))
  }

  const handleConfirmDelete = async () => {
    try {
      setLoading(true)
      const paths = itemsToDelete.map(item => item.path)
      await invoke('delete_items', { paths })
      setItemsToDelete([])
      setShowDeleteConfirm(false)
      // Refresh current view
      if (currentPath) {
        await buildCache(currentPath)
        await loadDirectoryChildrenWithDepth(currentPath, maxDepth)
      }
    } catch (err) {
      setError(`Failed to delete items: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const truncateMiddle = (text: string, maxLength: number = 24) => {
    if (text.length <= maxLength) return text
    const start = Math.ceil(maxLength / 2)
    const end = Math.floor(maxLength / 2)
    return text.slice(0, start) + '...' + text.slice(-end)
  }

  return (
    <div className={`app-container`}>
      {<div className="titlebar-drag-region" data-tauri-drag-region />}

      {/* Permission Banner */}
      {hasDiskAccess === false && (
        <div className="permission-banner">
          <ShieldAlert className="text-yellow-500" size={20} />
          <div className="flex-1">
            <p className="font-bold">Full Disk Access Required</p>
            <p className="text-sm opacity-90">Maka needs permission to scan your disk accurately.</p>
          </div>
          <button onClick={handleOpenPrivacy} className="btn-small">
            Open Settings
          </button>
        </div>
      )}
      {/* Sidebar */}
      <div className="sidebar" style={{ paddingTop: '52px' }}>
        {/* <div className="sidebar-header"> */}
        <div className="app-title flex items-center gap-2">
          <span>Maka</span>
        </div>
        {/* </div> */}

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
          <div className="section-title">View Depth: {maxDepth}</div>
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
                }
              }}
            />
          </div>
        </div>

        {/* Delete Zone */}
        <div className="sidebar-section flex-1 min-h-0 flex flex-col">
          <div className="section-title flex justify-between items-center">
            <span>Delete Zone</span>
            {itemsToDelete.length > 0 && (
              <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">
                {itemsToDelete.length}
              </span>
            )}
          </div>
          <div
            className={`delete-zone ${isDraggingOver ? 'drag-over' : ''} ${itemsToDelete.length > 0 ? 'has-items' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {itemsToDelete.length === 0 ? (
              <div className="delete-placeholder">
                <Trash2 size={24} className="mb-2 opacity-50" />
                <p className="text-xs text-center opacity-70">
                  Drag items here to delete
                </p>
              </div>
            ) : (
              <div className="delete-list">
                {itemsToDelete.map(item => (
                  <div key={item.path} className="delete-item">
                    <div className="flex items-center gap-2 overflow-hidden">
                      {item.is_directory ? <FolderOpen size={12} /> : <File size={12} />}
                      <span className="truncate text-xs" title={item.path}>{item.name}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveFromDeleteList(item.path)}
                      className="delete-item-remove"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {itemsToDelete.length > 0 && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="btn btn-danger mt-2 w-full"
              >
                <Trash2 size={14} />
                Delete All
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <AlertTriangle className="text-red-500" size={24} />
              <h3>Confirm Deletion</h3>
            </div>
            <p className="mb-4">
              Are you sure you want to permanently delete {itemsToDelete.length} items?
              This action cannot be undone.
            </p>
            <div className="max-h-40 overflow-y-auto bg-gray-900 p-2 rounded mb-4 text-xs font-mono">
              {itemsToDelete.map(item => (
                <div key={item.path} className="truncate">{item.path}</div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="btn btn-danger"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="main-content" style={{ paddingTop: '32px' }}>
        <div className="content-header">
          <div className="path-breadcrumb" title={currentPath}>
            {!currentPath ? 'No directory selected' : (
              <div className="flex items-center flex-wrap">
                {currentPath.split('/').map((segment, index, array) => {
                  if (segment === '' && index === 0) return (
                    <span
                      key={index}
                      className="breadcrumb-segment cursor-pointer hover:text-white hover:underline"
                      onClick={() => handleBreadcrumbClick('/')}
                    >
                      /
                    </span>
                  );
                  if (segment === '') return null;

                  const path = array.slice(0, index + 1).join('/') || '/';
                  return (
                    <React.Fragment key={index}>
                      {index > 1 && '/'}
                      <span
                        className="breadcrumb-segment cursor-pointer hover:text-white hover:underline"
                        onClick={() => handleBreadcrumbClick(path)}
                      >
                        {segment}
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
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
                <div className="text-sm text-gray-400">Scanning...</div>
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
            <div className="info-card details-card">
              {selectedNode ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="flex items-center gap-2 cursor-pointer group"
                      onClick={() => handleCopyPath(selectedNode.path)}
                      title={`Click to copy: ${selectedNode.path}`}
                    >
                      <h3 className="text-lg font-semibold">
                        {copied ? (
                          <Check size={16} className="text-green-500" />
                        ) : (
                          <Copy size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                        )}
                        &nbsp;
                        {truncateMiddle(selectedNode.name, 20)}
                      </h3>

                    </div>
                  </div>

                  <div className="stat-item">
                    <span className="stat-label">Type</span>
                    <span className="stat-value">
                      {selectedNode.is_directory ? 'Directory' : 'File'}
                    </span>
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
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <p>Select an item to view details</p>
                </div>
              )}
            </div>

            {selectedNode && selectedNode.children.length > 0 && (
              <div className="info-card items-card">
                <h3 className="text-sm font-bold mb-3 text-gray-400 uppercase tracking-wider">
                  Top Items
                </h3>
                <div className="flex-1 flex flex-col gap-2 min-h-0">
                  {(() => {
                    const sortedChildren = [...selectedNode.children].sort((a, b) => b.size - a.size);
                    const MAX_ITEMS = 9;
                    const displayItems = sortedChildren.slice(0, MAX_ITEMS);
                    const remainingItems = sortedChildren.slice(MAX_ITEMS);
                    const otherSize = remainingItems.reduce((acc, item) => acc + item.size, 0);

                    return (
                      <>
                        {displayItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="item-row cursor-default hover:bg-transparent"
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${item.is_directory ? 'bg-blue-500' : 'bg-gray-500'}`} />
                              <span className="text-sm truncate opacity-90" title={item.name}>
                                {truncateMiddle(item.name, 20)}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500 whitespace-nowrap font-mono ml-2">
                              {formatSize(item.size)}
                            </span>
                          </div>
                        ))}
                        {otherSize > 0 && (
                          <div className="item-row cursor-default hover:bg-transparent">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="w-2 h-2 rounded-full shrink-0 bg-gray-700" />
                              <span className="text-sm truncate opacity-90 italic">Other {remainingItems.length} items</span>
                            </div>
                            <span className="text-xs text-gray-500 whitespace-nowrap font-mono ml-2">
                              {formatSize(otherSize)}
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div >
  )
}

export default App
