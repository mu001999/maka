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

interface SunburstChartProps {
  data: FileNode | null;
  onNodeClick: (node: FileNode) => void;
  onNodeHover?: (node: FileNode) => void;
  width?: number;
  height?: number;
  onDragStart?: React.Dispatch<React.SetStateAction<Set<string>>>;
}

const SunburstChart: React.FC<SunburstChartProps> = ({
  data,
  onNodeClick,
  onNodeHover,
  width,
  height,
  onDragStart
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
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
    if (!containerRef.current || !data) return;

    const renderChart = () => {
      if (!containerRef.current || !svgRef.current) return;

      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;

      // If container has no size yet, skip rendering
      if (containerWidth === 0 || containerHeight === 0) return;

      const chartWidth = width || Math.min(containerWidth, containerHeight);
      const chartHeight = height || Math.min(containerWidth, containerHeight);
      const size = Math.min(chartWidth, chartHeight) * 0.9; // 90% of available space
      const radius = size / 2;

      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();

      svg.attr('width', size).attr('height', size);

      const g = svg
        .append('g')
        .attr('transform', `translate(${size / 2},${size / 2})`);


      const partition = d3.partition<FileNode>()
        .size([2 * Math.PI, radius]);

      // Create hierarchy
      const root = d3.hierarchy(data);

      // Use backend-provided sizes directly without recalculation
      root.each((node: any) => {
        node.value = node.data.size;
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

      const threshold = (root.value || 1) * 0.001;
      // 渲染路径
      g.selectAll('path')
        .data(root.descendants().filter(d => {
          return d.data.show && (d.value || 0) > threshold;
        }))
        .enter()
        .append('path')
        .attr('d', arc)
        .style('fill', (d: any) => color(d.data.name))
        .style('stroke', '#fff')
        .style('stroke-width', 2)
        .style('cursor', 'grab')
        .style('opacity', 0.8)
        .call(d3.drag<SVGPathElement, any>()
          .on('start', function (event: any, d: any) {
            // Store initial position and data
            (window as any).__dragStartX = event.x;
            (window as any).__dragStartY = event.y;
            (window as any).__dragData = d.data;
            (window as any).__isDragging = false;
          })
          .on('drag', function (event: any, d: any) {
            // Calculate distance moved
            const dx = event.x - (window as any).__dragStartX;
            const dy = event.y - (window as any).__dragStartY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Only start dragging if moved more than 5 pixels
            if (distance > 5 && !(window as any).__isDragging) {
              (window as any).__isDragging = true;

              // Add to dragged nodes set
              if (onDragStart) {
                onDragStart(prev => {
                  const newSet = new Set(prev);
                  newSet.add(d.data.path);
                  return newSet;
                });
              }

              // Create ghost element
              const ghost = document.createElement('div');
              ghost.id = 'drag-ghost';
              ghost.style.cssText = `
                position: fixed;
                pointer-events: none;
                z-index: 10000;
                background: rgba(59, 130, 246, 0.9);
                color: white;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 14px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                display: flex;
                align-items: center;
                gap: 6px;
              `;
              ghost.innerHTML = `
                ${d.data.is_directory ? '📁' : '📄'} ${d.data.name.length > 20 ? d.data.name.substring(0, 20) + '...' : d.data.name}
              `;
              document.body.appendChild(ghost);
            }

            // Update ghost position if dragging
            if ((window as any).__isDragging) {
              const ghost = document.getElementById('drag-ghost');
              if (ghost) {
                ghost.style.left = (event.sourceEvent.clientX + 10) + 'px';
                ghost.style.top = (event.sourceEvent.clientY + 10) + 'px';
              }
            }
          })
          .on('end', function (event: any, d: any) {
            try {
              const isDragging = (window as any).__isDragging;

              // If not dragging (just a click), trigger click event
              if (!isDragging) {
                if (d.data.path && d.data.path !== data.path) {
                  onNodeClick(d.data);
                }
                return;
              }

              const ghost = document.getElementById('drag-ghost');
              if (ghost) {
                ghost.remove();
              }

              // Check if dropped on delete zone
              const deleteZone = document.querySelector('.delete-zone');
              let droppedOnDeleteZone = false;

              if (deleteZone && event && event.sourceEvent) {
                const rect = deleteZone.getBoundingClientRect();
                const x = event.sourceEvent.clientX;
                const y = event.sourceEvent.clientY;

                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                  droppedOnDeleteZone = true;
                  const dropEvent = new DragEvent('drop', {
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y
                  });

                  Object.defineProperty(dropEvent, 'dataTransfer', {
                    value: {
                      getData: () => JSON.stringify((window as any).__dragData),
                      setData: () => { },
                      effectAllowed: 'copy'
                    }
                  });

                  deleteZone.dispatchEvent(dropEvent);
                }
              }

              // Restore if not dropped on delete zone
              if (!droppedOnDeleteZone && onDragStart && (window as any).__dragData) {
                const dragData = (window as any).__dragData;
                if (dragData && dragData.path) {
                  onDragStart(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(dragData.path);
                    return newSet;
                  });
                }
              }
            } catch (error) {
              console.error('Error in drag end:', error);
            } finally {
              delete (window as any).__dragData;
              delete (window as any).__dragStartX;
              delete (window as any).__dragStartY;
              delete (window as any).__isDragging;
            }
          })
        )
        .on('mouseover', function (event: any, d: any) {
          d3.select(this)
            .style('opacity', 1)
            .style('stroke-width', 3);

          // Update selected node in Details panel
          if (onNodeHover && d.data.path) {
            onNodeHover(d.data);
          }

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
        .on('mouseout', function () {
          d3.select(this)
            .style('opacity', 0.8)
            .style('stroke-width', 2);

          tooltip.transition()
            .duration(500)
            .style('opacity', 0);
        })
        .on('click', function (_event: any, d: any) {
          // Only trigger onNodeClick for actual file nodes (not the virtual root)
          if (d.data.path && d.data.path !== data.path) {
            onNodeClick(d.data);
          }
        });

      // Add center text (after paths so it stays on top)
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .style('font-size', '1.5em')
        .style('font-weight', 'bold')
        .style('fill', 'white')
        .style('pointer-events', 'none') // Prevent interfering with hover
        .text(formatSize(data.size));

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
    <div ref={containerRef} className="sunburst-chart">
      <svg ref={svgRef} className="sunburst-chart-svg"></svg>
    </div>
  );
};

export default SunburstChart;
