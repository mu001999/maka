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

interface SunburstChartProps {
  data: FileNode[];
  onNodeClick: (node: FileNode) => void;
  width?: number;
  height?: number;
}

const SunburstChart: React.FC<SunburstChartProps> = ({ data, onNodeClick, width = 600, height = 600 }) => {
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

    const radius = Math.min(width, height) / 2;

    svg.attr('width', width).attr('height', height);

    const g = svg
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    const partition = d3.partition<FileNode>()
      .size([2 * Math.PI, radius]);

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

    partition(root);

    const arc = d3.arc<any>()
      .startAngle((d: any) => d.x0)
      .endAngle((d: any) => d.x1)
      .innerRadius((d: any) => d.y0)
      .outerRadius((d: any) => d.y1);

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    const tooltip = d3.select('body')
      .append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0);

    // const paths = g.selectAll('path')
    g.selectAll('path')
      .data(root.descendants())
      .enter()
      .append('path')
      .attr('d', arc)
      .style('fill', (d: any) => color(d.data.name))
      .style('stroke', '#fff')
      .style('stroke-width', 2)
      .style('cursor', 'pointer')
      .style('opacity', 0.8)
      .on('mouseover', function(event: any, d: any) {
        d3.select(this)
          .style('opacity', 1)
          .style('stroke-width', 3);

        tooltip.transition()
          .duration(200)
          .style('opacity', 0.9);

        tooltip.html(`
          <strong>${d.data.name}</strong><br/>
          Size: ${formatSize(d.value || 0)}<br/>
          ${d.data.is_directory ? 'Directory' : 'File'}
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
      .on('click', function(_event: any, d: any) {
        setSelectedNode(d.data);
        // Only trigger onNodeClick for actual file nodes (not the virtual root)
        if (d.data.path && d.data.name !== 'Current Directory') {
          onNodeClick(d.data);
        }
      });

    // Add labels for larger segments
    /*
    const labels = g.selectAll('text')
      .data(root.descendants())
      .enter()
      .append('text')
      .attr('transform', (d: any) => {
        const angle = (d.x0 + d.x1) / 2;
        const radius = (d.y0 + d.y1) / 2;
        return `rotate(${angle * 180 / Math.PI - 90}) translate(${radius},0) rotate(${angle > Math.PI ? 180 : 0})`;
      })
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .text((d: any) => {
        const angle = d.x1 - d.x0;
        const radius = d.y1 - d.y0;
        const area = angle * radius * radius;
        // Show labels for segments that are large enough and have reasonable text length
        const minArea = 0.005; // Reduced threshold for better visibility
        if (area > minArea && d.data.name.length < 15) {
          // 对于文件，显示名称和大小；对于目录，只显示名称
          if (d.data.is_directory) {
            return d.data.name;
          } else {
            // 对于大文件，显示名称和大小
            return d.data.size > 1024 * 1024 ? `${d.data.name}` : d.data.name;
          }
        }
        return '';
      })
      .style('font-size', '12px')
      .style('fill', '#333')
      .style('pointer-events', 'none');
    */

    return () => {
      tooltip.remove();
    };
  }, [data]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <svg ref={svgRef} style={{ flex: 1 }} className="sunburst-chart"></svg>
      {selectedNode && (
        <div className="file-info">
          <h4>Selected: {selectedNode.name}</h4>
          <p>Path: {selectedNode.path}</p>
          <p>Size: {formatSize(selectedNode.size)}</p>
          <p>Type: {selectedNode.is_directory ? 'Directory' : 'File'}</p>
          {selectedNode.is_directory && (
            <p>Children: {selectedNode.children.length}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default SunburstChart;
