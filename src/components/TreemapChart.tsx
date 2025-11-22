import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface FileNode {
  name: string;
  path: string;
  size: number;
  is_directory: boolean;
  children: FileNode[];
  inode?: number;
  children_count?: number;
}

interface TreemapChartProps {
  data: FileNode[];
  onNodeClick: (node: FileNode) => void;
  width?: number;
  height?: number;
}

const TreemapChart: React.FC<TreemapChartProps> = ({ data, onNodeClick, width = 800, height = 600 }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);

  const formatSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  useEffect(() => {
    if (!svgRef.current || !data || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('width', width).attr('height', height);

    const treemap = d3.treemap<FileNode>()
      .size([width, height])
      .padding(2)
      .round(true);

    // Create a virtual root node for the current directory children
    const virtualRoot: FileNode = {
      name: 'Current Directory',
      path: '',
      size: data.reduce((sum, item) => sum + item.size, 0),
      is_directory: true,
      children: data
    };

    const root = d3.hierarchy(virtualRoot)
      .sum(d => d.size)  // Include both files and directories in size calculation
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    treemap(root);

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    const tooltip = d3.select('body')
      .append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0);

    const cells = svg.selectAll('g')
      .data(root.leaves())
      .enter()
      .append('g');

    cells.append('rect')
      .attr('x', (d: any) => d.x0)
      .attr('y', (d: any) => d.y0)
      .attr('width', (d: any) => d.x1 - d.x0)
      .attr('height', (d: any) => d.y1 - d.y0)
      .style('fill', d => color(d.data.name))
      .style('stroke', '#fff')
      .style('stroke-width', 2)
      .style('cursor', 'pointer')
      .style('opacity', 0.8)
      .on('mouseover', function(event, d) {
        d3.select(this)
          .style('opacity', 1)
          .style('stroke-width', 3);

        tooltip.transition()
          .duration(200)
          .style('opacity', 0.9);

        tooltip.html(`
          <strong>${d.data.name}</strong><br/>
          Size: ${formatSize(d.data.size)}<br/>
          Path: ${d.data.path}
        `)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', function() {
        d3.select(this)
          .style('opacity', 0.8)
          .style('stroke-width', 2);

        tooltip.transition()
          .duration(500)
          .style('opacity', 0);
      })
      .on('click', function(_event, d) {
        setSelectedNode(d.data);
        // Only trigger onNodeClick for actual file nodes (not the virtual root)
        if (d.data.path && d.data.name !== 'Current Directory') {
          onNodeClick(d.data);
        }
      });

    // Add labels for larger rectangles
    cells.append('text')
      .attr('x', (d: any) => d.x0 + 5)
      .attr('y', (d: any) => d.y0 + 15)
      .text((d: any) => {
        const width = d.x1 - d.x0;
        const height = d.y1 - d.y0;
        const area = width * height;
        // 显示标签的条件：面积足够大且名称不太长
        if (area > 2000 && d.data.name.length < 20) {
          // 对于目录和较大的文件都显示名称
          return d.data.name;
        }
        return '';
      })
      .style('font-size', '12px')
      .style('fill', '#333')
      .style('pointer-events', 'none');

    // Add size labels for larger rectangles
    cells.append('text')
      .attr('x', (d: any) => d.x0 + 5)
      .attr('y', (d: any) => d.y0 + 30)
      .text((d: any) => {
        const width = d.x1 - d.x0;
        const height = d.y1 - d.y0;
        const area = width * height;
        return area > 3000 ? formatSize(d.data.size) : '';
      })
      .style('font-size', '10px')
      .style('fill', '#666')
      .style('pointer-events', 'none');

    return () => {
      tooltip.remove();
    };
  }, [data]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <svg ref={svgRef} style={{ flex: 1 }} className="treemap-chart"></svg>
      {selectedNode && (
        <div className="file-info">
          <h4>Selected: {selectedNode.name}</h4>
          <p>Path: {selectedNode.path}</p>
          <p>Size: {formatSize(selectedNode.size)}</p>
          <p>Type: {selectedNode.is_directory ? 'Directory' : 'File'}</p>
        </div>
      )}
    </div>
  );
};

export default TreemapChart;
