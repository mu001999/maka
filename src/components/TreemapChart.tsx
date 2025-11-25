import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface FileNode {
  name: string;
  path: string;
  size: number;
  is_directory: boolean;
  children: FileNode[];
  children_count: number;
  show: boolean;
}

interface TreemapChartProps {
  data: FileNode | null;
  width?: number;
  height?: number;
  onNodeClick: (node: FileNode) => void;
  onNodeHover: (node: FileNode) => void;
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
  onNodeHover,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !data) return;

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

      // Create hierarchy with filtered data - filter out hidden nodes
      const root = d3.hierarchy(data, (d) => {
        if (!d.children) return null;
        const visibleChildren = d.children.filter(c => c.show);
        return visibleChildren.length > 0 ? visibleChildren : null;
      })

      // Use backend-provided sizes directly without recalculation
      root.each((node: any) => {
        node.value = node.data.size;
      });

      // Sort by value
      root.sort((a, b) => (b.value || 0) - (a.value || 0));

      // Create treemap layout
      const treemap = d3.treemap<FileNode>()
        .tile(d3.treemapSquarify)
        .size([treemapWidth, treemapHeight])
        .padding(1)
        .round(true);

      treemap(root);

      // Tooltip
      const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0);

      // Create rectangles for each item
      // We only want to render the leaves of our filtered hierarchy
      const leaves = root.leaves() as d3.HierarchyRectangularNode<FileNode>[];

      const cells = svg.selectAll('g')
        .data(leaves)
        .enter()
        .append('g')
        .attr('transform', d => `translate(${d.x0 + padding},${d.y0 + padding})`);

      // Color scale
      const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

      // Color function - color by top-level parent (block)
      const getColor = (d: d3.HierarchyRectangularNode<FileNode>) => {
        // Find the ancestor at depth 1 (direct child of root)
        const ancestors = d.ancestors();
        // ancestors is [node, parent, ..., root]
        // We want the one just before root (which is at index length - 2)
        // If the node itself is depth 1, it will be at index 0, and length is 2.

        let categoryNode = d;
        if (ancestors.length > 2) {
          categoryNode = ancestors[ancestors.length - 2] as d3.HierarchyRectangularNode<FileNode>;
        } else if (d.depth === 1) {
          categoryNode = d;
        }
        // If d is root (depth 0), fallback (though leaves shouldn't be root usually)

        return colorScale(categoryNode.data.name);
      };

      // Add rectangles - entire area is clickable
      cells.append('rect')
        .attr('width', d => d.x1 - d.x0)
        .attr('height', d => d.y1 - d.y0)
        .style('fill', getColor)
        .style('stroke', '#fff')
        .style('stroke-width', 1)
        .style('cursor', 'grab')
        .style('opacity', 0.8)
        .call(d3.drag<SVGRectElement, any>()
          .on('start', function (_event: any, d: any) {
            d3.select(this).style('cursor', 'grabbing').style('opacity', 0.6);
            // Store data for drop
            (window as any).__dragData = d.data;
          })
          .on('drag', function (_event: any) {
            // Visual feedback during drag
            d3.select(this).style('opacity', 0.4);
          })
          .on('end', function (event: any, _d: any) {
            d3.select(this).style('cursor', 'grab').style('opacity', 0.8);

            // Check if dropped on delete zone
            const deleteZone = document.querySelector('.delete-zone');
            if (deleteZone) {
              const rect = deleteZone.getBoundingClientRect();
              const x = event.sourceEvent.clientX;
              const y = event.sourceEvent.clientY;

              if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                // Trigger drop event on delete zone
                const dropEvent = new DragEvent('drop', {
                  bubbles: true,
                  cancelable: true,
                  clientX: x,
                  clientY: y
                });

                // Set data transfer
                Object.defineProperty(dropEvent, 'dataTransfer', {
                  value: {
                    getData: () => JSON.stringify((window as any).__dragData),
                    setData: () => { },
                    effectAllowed: 'copy'
                  }
                });

                deleteZone.dispatchEvent(dropEvent);
                delete (window as any).__dragData;
              }
            }
          })
        )
        .on('mouseover', function (event, d) {
          d3.select(this)
            .style('opacity', 1)
            .style('stroke', '#2c3e50')
            .style('stroke-width', 3);

          // Update selected node in Details panel
          if (onNodeHover && d.data.path) {
            onNodeHover(d.data);
          }

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
        .on('mouseout', function (_event, _d) {
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
          if (d.data.path) {
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

          if (width < d.data.name.length * 15 || height < 20) return '';

          return `${d.data.name}`;
        })
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .style('fill', d => d.data.is_directory ? '#2c3e50' : '#333')
        .style('pointer-events', 'none');

      // Add size labels
      cells.append('text')
        .attr('x', d => (d.x1 - d.x0) / 2)
        .attr('y', d => (d.y1 - d.y0) / 2 + 15)
        .attr('text-anchor', 'middle')
        .text(d => {
          const width = d.x1 - d.x0;
          const height = d.y1 - d.y0;

          const text = formatSize(d.data.size);

          if (width < text.length * 13 || height < 40) return '';
          return text;
        })
        .style('font-size', '12px')
        .style('fill', d => d.data.is_directory ? '#34495e' : '#7f8c8d')
        .style('pointer-events', 'none');

      // Add type labels
      cells.append('text')
        .attr('x', d => (d.x1 - d.x0) / 2)
        .attr('y', d => (d.y1 - d.y0) / 2 + 35)
        .attr('text-anchor', 'middle')
        .text(d => {
          const width = d.x1 - d.x0;
          const height = d.y1 - d.y0;

          if (d.data.is_directory) {
            const childrenCount = d.data.children ? d.data.children.length : 0;
            const text = childrenCount > 0 ? `${childrenCount} items` : 'Empty';

            if (width < text.length * 13 || height < 60) return '';

            return text;
          } else {
            return "";
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
