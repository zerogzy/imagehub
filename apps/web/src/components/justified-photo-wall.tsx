'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { MediaCard } from './media-card';

interface PhotoWallAsset {
  id: string;
  originalFilename: string;
  displayFilename: string | null;
  mediaType: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  sizeBytes: string;
  status: string;
  thumbStorageKey: string | null;
  previewStorageKey?: string | null;
  tags: { id: string; name: string; source?: string }[];
  createdAt: string;
}

interface LayoutBox {
  asset: PhotoWallAsset;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface LayoutOptions {
  rowWidth: number;
  rowHeight: number;
  spacing: number;
  heightTolerance: number;
}

interface JustifiedLayoutResult {
  boxes: LayoutBox[];
  height: number;
}

interface JustifiedPhotoWallProps {
  assets: PhotoWallAsset[];
  onAssetClick: (asset: PhotoWallAsset) => void;
  className?: string;
}

interface ViewportWindow {
  top: number;
  bottom: number;
}

const OVERSCAN_PX = 700;
const MOBILE_GRID_WIDTH = 640;

function getLayoutOptions(rowWidth: number): LayoutOptions {
  return {
    rowWidth,
    rowHeight: rowWidth < 640 ? 100 : rowWidth < 1024 ? 170 : 235,
    spacing: 2,
    heightTolerance: 0.5,
  };
}

function getAssetRatio(asset: PhotoWallAsset) {
  if (!asset.width || !asset.height || asset.width <= 0 || asset.height <= 0) {
    return 1;
  }

  // Keep malformed metadata from creating unusably tall or wide rows.
  return Math.min(Math.max(asset.width / asset.height, 0.25), 5);
}

function layoutRow(
  row: PhotoWallAsset[],
  top: number,
  rowHeight: number,
  rowWidth: number,
  spacing: number,
  justify = true,
): LayoutBox[] {
  const boxes: LayoutBox[] = [];
  const ratios = row.map(getAssetRatio);
  const availableWidth = rowWidth - spacing * Math.max(row.length - 1, 0);
  let left = 0;
  let usedWidth = 0;

  row.forEach((asset, index) => {
    const shouldAbsorbRounding = justify && index === row.length - 1;
    const width = shouldAbsorbRounding
      ? Math.max(1, availableWidth - usedWidth)
      : Math.max(1, Math.round(ratios[index] * rowHeight));

    boxes.push({
      asset,
      top,
      left,
      width,
      height: rowHeight,
    });

    usedWidth += width;
    left += width + spacing;
  });

  return boxes;
}

function getJustifiedLayoutFromAssets(assets: PhotoWallAsset[], options: LayoutOptions): JustifiedLayoutResult {
  const { rowWidth, rowHeight, spacing, heightTolerance } = options;
  const boxes: LayoutBox[] = [];
  const minRowHeight = rowHeight * (1 - heightTolerance);
  const maxRowHeight = rowHeight * (1 + heightTolerance);
  let row: PhotoWallAsset[] = [];
  let ratioSum = 0;
  let top = 0;

  const flushRow = (items: PhotoWallAsset[], height: number, justify = true) => {
    const roundedHeight = Math.max(1, Math.round(height));
    boxes.push(...layoutRow(items, top, roundedHeight, rowWidth, spacing, justify));
    top += roundedHeight + spacing;
  };

  for (const asset of assets) {
    row.push(asset);
    ratioSum += getAssetRatio(asset);

    const rowSpacing = spacing * Math.max(row.length - 1, 0);
    const candidateHeight = (rowWidth - rowSpacing) / ratioSum;

    if (candidateHeight >= rowHeight) {
      continue;
    }

    if (candidateHeight >= minRowHeight) {
      flushRow(row, candidateHeight);
      row = [];
      ratioSum = 0;
      continue;
    }

    if (row.length === 1) {
      flushRow(row, candidateHeight);
      row = [];
      ratioSum = 0;
      continue;
    }

    const lastAsset = row[row.length - 1];
    const previousRow = row.slice(0, -1);
    const previousRatioSum = ratioSum - getAssetRatio(lastAsset);
    const previousSpacing = spacing * Math.max(previousRow.length - 1, 0);
    const previousHeight = (rowWidth - previousSpacing) / previousRatioSum;
    const usePreviousRow = Math.abs(previousHeight - rowHeight) <= Math.abs(candidateHeight - rowHeight);

    if (usePreviousRow) {
      flushRow(previousRow, previousHeight);
      row = [lastAsset];
      ratioSum = getAssetRatio(lastAsset);
    } else {
      flushRow(row, candidateHeight);
      row = [];
      ratioSum = 0;
    }
  }

  if (row.length > 0) {
    const rowSpacing = spacing * Math.max(row.length - 1, 0);
    const naturalWidth = ratioSum * rowHeight + rowSpacing;
    const shouldJustifyLastRow = naturalWidth >= rowWidth * 0.72;
    const finalHeight = shouldJustifyLastRow
      ? Math.min(Math.max((rowWidth - rowSpacing) / ratioSum, minRowHeight), maxRowHeight)
      : rowHeight;

    flushRow(row, finalHeight, shouldJustifyLastRow);
  }

  return {
    boxes,
    height: Math.max(0, top - spacing),
  };
}

function getScrollParent(node: HTMLElement): HTMLElement | Window {
  let parent = node.parentElement;

  while (parent) {
    const style = window.getComputedStyle(parent);
    const overflowY = style.overflowY;

    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return parent;
    }

    parent = parent.parentElement;
  }

  return window;
}

function isWindowScrollRoot(scrollRoot: HTMLElement | Window): scrollRoot is Window {
  return scrollRoot === window;
}

export function JustifiedPhotoWall({ assets, onAssetClick, className }: JustifiedPhotoWallProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRootRef = useRef<HTMLElement | Window | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [viewport, setViewport] = useState<ViewportWindow>({ top: 0, bottom: Number.POSITIVE_INFINITY });
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(`(max-width: ${MOBILE_GRID_WIDTH - 1}px)`).matches,
  );
  const useMobileGrid = isMobileViewport || (containerWidth > 0 && containerWidth < MOBILE_GRID_WIDTH);

  const updateViewport = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollRoot = scrollRootRef.current || getScrollParent(container);
    scrollRootRef.current = scrollRoot;

    const containerRect = container.getBoundingClientRect();
    const rootTop = isWindowScrollRoot(scrollRoot) ? 0 : scrollRoot.getBoundingClientRect().top;
    const rootHeight = isWindowScrollRoot(scrollRoot) ? window.innerHeight : scrollRoot.clientHeight;
    const offsetTop = containerRect.top - rootTop;
    const nextViewport = {
      top: Math.max(0, Math.floor(-offsetTop - OVERSCAN_PX)),
      bottom: Math.ceil(-offsetTop + rootHeight + OVERSCAN_PX),
    };

    setViewport((previous) =>
      previous.top === nextViewport.top && previous.bottom === nextViewport.bottom ? previous : nextViewport,
    );
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const width = Math.floor(entries[0]?.contentRect.width || 0);
      setContainerWidth((previous) => (previous === width ? previous : width));
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_GRID_WIDTH - 1}px)`);
    const handleChange = () => setIsMobileViewport(mediaQuery.matches);

    handleChange();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const layout = useMemo(() => {
    if (containerWidth <= 0 || useMobileGrid) {
      return { boxes: [], height: 0 };
    }

    return getJustifiedLayoutFromAssets(assets, getLayoutOptions(containerWidth));
  }, [assets, containerWidth, useMobileGrid]);

  useEffect(() => {
    if (useMobileGrid) return;

    const container = containerRef.current;
    if (!container) return;

    const scrollRoot = getScrollParent(container);
    scrollRootRef.current = scrollRoot;
    let animationFrame = 0;

    const scheduleUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        updateViewport();
      });
    };

    updateViewport();
    scrollRoot.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      scrollRoot.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [useMobileGrid, layout.height, updateViewport]);

  const visibleBoxes = useMemo(
    () => layout.boxes.filter((box) => box.top + box.height >= viewport.top && box.top <= viewport.bottom),
    [layout.boxes, viewport],
  );

  if (useMobileGrid) {
    return (
      <div
        ref={containerRef}
        className={cn('photo-wall-mobile-grid', className)}
        role="list"
        aria-label="图片广场照片墙"
      >
        {assets.map((asset) => (
          <MediaCard
            key={asset.id}
            asset={asset}
            onClick={() => onAssetClick(asset)}
            className="photo-wall-mobile-item"
          />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn('photo-wall', className)}
      style={{ height: layout.height || undefined } as CSSProperties}
      role="list"
      aria-label="图片广场照片墙"
    >
      {visibleBoxes.map((box) => (
        <MediaCard
          key={box.asset.id}
          asset={box.asset}
          onClick={() => onAssetClick(box.asset)}
          className="photo-wall-positioned"
          style={{
            width: box.width,
            height: box.height,
            transform: `translate3d(${box.left}px, ${box.top}px, 0)`,
          }}
        />
      ))}
    </div>
  );
}
