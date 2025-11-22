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

const SunburstChart: React.FC<SunburstChartProps> = ({ data, onNodeClick, width, height }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

    // Get container dimensions for fixed size
    const container = svgRef.current.parentElement;
    const containerWidth = container?.clientWidth || 600;
    const containerHeight = container?.clientHeight || 600;
    const chartWidth = width || Math.min(containerWidth, containerHeight);
    const chartHeight = height || Math.min(containerWidth, containerHeight);

    const renderChart = () => {
      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();

      // Use the smaller dimension to ensure the chart fits
      const size = Math.min(chartWidth, chartHeight);
      const radius = size / 2 - 20; // Add some padding

      svg.attr('width', size).attr('height', size);

      const g = svg
        .append('g')
        .attr('transform', `translate(${size / 2},${size / 2})`);

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

      // Create hierarchy and manually set values to use pre-calculated sizes from backend
      const root = d3.hierarchy(virtualRoot);

      // Manually set values using pre-calculated sizes from backend
      root.each(d => {
        d.value = d.data.size; // Use the pre-calculated size from backend
      });

      // Sort by value
      root.sort((a, b) => (b.value || 0) - (a.value || 0));

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

        // 渲染路径
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

        return () => {
          tooltip.remove();
        };
      };

      renderChart();
  }, [data]);

  return (
    <div ref={containerRef} className="sunburst-chart">
      <svg ref={svgRef} className="sunburst-chart-svg"></svg>
    </div>
  );
};

export default SunburstChart;
