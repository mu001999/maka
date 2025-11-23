import React, { useEffect, useRef } from 'react';
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
  width?: number;
  height?: number;
  onNodeClick: (node: FileNode) => void;
}

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const TreemapChart: React.FC<TreemapChartProps> = ({
  data,
  width,
  height,
  onNodeClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !data || data.length === 0) return;

    const renderChart = () => {
      if (!containerRef.current || !svgRef.current) return;

      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;

      // If container has no size yet, skip rendering
      if (containerWidth === 0 || containerHeight === 0) return;

      const chartWidth = width || containerWidth;
      const chartHeight = height || containerHeight;

      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();

      const padding = 20;
      const treemapWidth = chartWidth - padding * 2;
      const treemapHeight = chartHeight - padding * 2;

      svg.attr('width', chartWidth).attr('height', chartHeight);

      // Filter data to show only immediate children of current path
      // For current path /A, we want to show only /A/B, not /A/B/C or deeper
      let displayData = data;

      // Filter out any nested children to ensure we only show one level
      displayData = data.map(item => ({
        ...item,
        children: [] // Remove any nested children to ensure only one level is show
      }));

      // Create hierarchy with filtered data - ONLY immediate children (one layer)
      const root = d3.hierarchy({ name: 'Current Directory', children: displayData } as unknown as FileNode)
        .sum(d => d.size)  // Use size for leaf nodes
        .sort((a, b) => (b.value || 0) - (a.value || 0));

      // Create treemap layout
      const treemap = d3.treemap<FileNode>()
        .size([treemapWidth, treemapHeight])
        .padding(2)
        .round(true);

      treemap(root);

      // Tooltip
      const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0);

      // Get ONLY immediate children (one layer) - use leaves() to get direct children
      const nodes = root.leaves() as d3.HierarchyRectangularNode<FileNode>[];

      // Create rectangles for each item
      const cells = svg.selectAll('g')
        .data(nodes)
        .enter()
        .append('g')
        .attr('transform', d => `translate(${d.x0 + padding},${d.y0 + padding})`);

      // Color function - different colors for directories vs files
      const getColor = (d: d3.HierarchyRectangularNode<FileNode>) => {
        if (d.data.is_directory) {
          return '#3498db'; // Blue for directories
        }
        return '#f39c12'; // Orange for files
      };

      // Add rectangles - entire area is clickable
      cells.append('rect')
        .attr('width', d => d.x1 - d.x0)
        .attr('height', d => d.y1 - d.y0)
        .style('fill', getColor)
        .style('stroke', '#fff')
        .style('stroke-width', 2)
        .style('cursor', 'pointer')
        .style('opacity', 0.8)
        .on('mouseover', function (event, d) {
          d3.select(this)
            .style('opacity', 1)
            .style('stroke', '#2c3e50')
            .style('stroke-width', 3);

          tooltip.transition()
            .duration(200)
            .style('opacity', 0.9);

          const childrenCount = d.data.is_directory ? (d.data.children ? d.data.children.length : 0) : 0;
          const itemType = d.data.is_directory ? '📁 Directory' : '📄 File';
          const itemInfo = d.data.is_directory && childrenCount > 0
            ? `${childrenCount} items`
            : formatSize(d.data.size);

          tooltip.html(`
            <strong>${d.data.name}</strong><br/>
            ${itemType}<br/>
            ${itemInfo}
          `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function (_event, d) {
          d3.select(this)
            .style('opacity', 0.8)
            .style('stroke', '#fff')
            .style('stroke-width', 2);

          tooltip.transition()
            .duration(500)
            .style('opacity', 0);
        })
        .on('click', function (_event, d) {
          // Only trigger onNodeClick for actual file nodes (not the virtual root)
          if (d.data.path && d.data.name !== 'Current Directory') {
            onNodeClick(d.data);
          }
        });

      // Add item labels
      cells.append('text')
        .attr('x', d => (d.x1 - d.x0) / 2)
        .attr('y', d => (d.y1 - d.y0) / 2 - 5)
        .attr('text-anchor', 'middle')
        .text(d => {
          const width = d.x1 - d.x0;
          const height = d.y1 - d.y0;
          const area = width * height;
          return (area > 1000 && d.data.name.length < 25) ? d.data.name : '';
        })
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .style('fill', d => d.data.is_directory ? '#2c3e50' : '#333')
        .style('pointer-events', 'none');

      // Add size/type labels
      cells.append('text')
        .attr('x', d => (d.x1 - d.x0) / 2)
        .attr('y', d => (d.y1 - d.y0) / 2 + 15)
        .attr('text-anchor', 'middle')
        .text(d => {
          const width = d.x1 - d.x0;
          const height = d.y1 - d.y0;
          const area = width * height;
          if (area <= 1500) return '';

          if (d.data.is_directory) {
            const childrenCount = d.data.children ? d.data.children.length : 0;
            return childrenCount > 0 ? `${childrenCount} items` : 'Empty';
          } else {
            return formatSize(d.data.size);
          }
        })
        .style('font-size', '12px')
        .style('fill', d => d.data.is_directory ? '#34495e' : '#7f8c8d')
        .style('pointer-events', 'none');

      return () => {
        tooltip.remove();
      };
    };

    renderChart();

    // Add ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      renderChart();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      d3.selectAll('.tooltip').remove();
    };
  }, [data, width, height]);

  return (
    <div ref={containerRef} className="treemap-chart">
      <svg ref={svgRef} className="treemap-chart-svg"></svg>
    </div>
  );
};

export default TreemapChart;
