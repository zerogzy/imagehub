'use client';

import { Loader2, Volume2 } from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';
import type { AssetDetail } from './types';
import { useImageZoom } from './use-image-zoom';

interface AssetDetailMediaProps {
  asset: AssetDetail;
  originalBlobUrl: string | null;
  originalLoading: boolean;
  zoom: ReturnType<typeof useImageZoom>;
  showInfo: boolean;
}

export function AssetDetailMedia({
  asset,
  originalBlobUrl,
  originalLoading,
  zoom,
  showInfo,
}: AssetDetailMediaProps) {
  // 图片走鉴权原图 (blob URL), DOM 里只暴露 blob: 协议 URL, 真实路径与原图直链都不外泄。
  // 缩略图作为加载兜底, 在 blob 还没拉到时先显示 large 派生图。
  // GIF/视频/音频需要播放, 仍使用原图直链 (storage/originals 对它们放行)。
  const derivativeUrl = (type: string) => {
    const key = asset.derivatives.find((d) => d.derivativeType === type)?.storageKey;
    return key ? `/api/v1/storage/derivatives/${key.replace('preview/', '')}` : null;
  };
  const originalUrl = `/api/v1/storage/originals/${asset.storageKey.replace('original/', '')}`;
  const isPlayable =
    asset.mediaType === 'video' || asset.mediaType === 'audio' || asset.mediaType === 'gif';
  const placeholderUrl =
    derivativeUrl('large') || derivativeUrl('preview') || derivativeUrl('thumb');
  const displayUrl = isPlayable ? originalUrl : originalBlobUrl || placeholderUrl || '';

  return (
    <div
      className={cn(
        'flex w-full items-center justify-center overflow-hidden bg-black/5 px-3 pb-4 pt-16 transition-all duration-200 md:px-24 md:pb-5 md:pt-20',
        showInfo ? 'md:w-3/5' : 'md:w-full',
      )}
      onMouseMove={zoom.onMouseMove}
      onMouseUp={zoom.onMouseUp}
      onMouseLeave={zoom.onMouseUp}
    >
      {asset.mediaType === 'video' ? (
        <div className="relative flex aspect-video w-full items-center justify-center rounded-lg bg-black overflow-hidden">
          <video src={originalUrl} controls autoPlay className="h-full w-full object-contain">
            您的浏览器不支持视频播放
          </video>
        </div>
      ) : asset.mediaType === 'audio' ? (
        <div className="flex aspect-square w-full max-w-sm flex-col items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5">
          <div className="mb-6 rounded-full bg-primary/20 p-6">
            <Volume2 className="h-12 w-12 text-primary/60" />
          </div>
          <p className="mb-2 text-sm font-medium text-text-primary">{asset.originalFilename}</p>
          {asset.duration && (
            <p className="mb-4 text-xs text-text-muted">{formatDuration(asset.duration)}</p>
          )}
          <audio controls src={originalUrl} className="w-64">
            您的浏览器不支持音频播放
          </audio>
        </div>
      ) : (
        <div className="relative flex max-h-full max-w-full items-center justify-center">
          <img
            src={displayUrl}
            alt={asset.displayFilename || asset.originalFilename}
            draggable={false}
            onDoubleClick={zoom.onDoubleClick}
            onMouseDown={zoom.onMouseDown}
            className={cn(
              'max-h-[calc(100dvh-96px)] max-w-full select-none rounded-lg object-contain md:max-h-[calc(90vh-100px)]',
              zoom.isDragging
                ? 'cursor-grabbing'
                : zoom.isZoomed
                  ? 'cursor-grab'
                  : 'cursor-zoom-in',
            )}
            style={{
              transform: `translate(${zoom.zoom.offsetX}px, ${zoom.zoom.offsetY}px) scale(${zoom.zoom.scale})`,
              transformOrigin: `${zoom.zoom.originX}px ${zoom.zoom.originY}px`,
              transition: zoom.isDragging ? 'none' : 'transform 160ms ease-out',
            }}
          />
          {originalLoading && !originalBlobUrl && (
            <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white shadow-md">
              <Loader2 className="h-3 w-3 animate-spin" />
              加载原图
            </div>
          )}
        </div>
      )}
    </div>
  );
}
