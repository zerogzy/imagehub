'use client';

import { useRef, useState, type MouseEvent } from 'react';
import type { ZoomState } from './types';

const INITIAL_ZOOM: ZoomState = {
  scale: 1,
  originX: 0,
  originY: 0,
  offsetX: 0,
  offsetY: 0,
};

/**
 * 图片双击放大 + 拖拽平移。仅在放大态启用拖拽。
 * 调 reset() 恢复 1x; isZoomed 给外部判断 (例如导航箭头切换 layout)。
 */
export function useImageZoom() {
  const [zoom, setZoom] = useState<ZoomState>(INITIAL_ZOOM);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const isZoomed = zoom.scale > 1;

  const reset = () => {
    setZoom(INITIAL_ZOOM);
    setIsDragging(false);
  };

  const onDoubleClick = (e: MouseEvent<HTMLImageElement>) => {
    if (isZoomed) {
      reset();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setZoom({
      scale: 2.5,
      originX: e.clientX - rect.left,
      originY: e.clientY - rect.top,
      offsetX: 0,
      offsetY: 0,
    });
  };

  const onMouseDown = (e: MouseEvent<HTMLImageElement>) => {
    if (!isZoomed) return;
    e.preventDefault();
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: zoom.offsetX,
      offsetY: zoom.offsetY,
    };
    setIsDragging(true);
  };

  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const start = dragStartRef.current;
    setZoom((current) => ({
      ...current,
      offsetX: start.offsetX + e.clientX - start.x,
      offsetY: start.offsetY + e.clientY - start.y,
    }));
  };

  const onMouseUp = () => setIsDragging(false);

  return {
    zoom,
    isZoomed,
    isDragging,
    reset,
    onDoubleClick,
    onMouseDown,
    onMouseMove,
    onMouseUp,
  };
}
