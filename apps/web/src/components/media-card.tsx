'use client';

import { useState, useRef, useCallback, type CSSProperties } from 'react';
import { cn, formatDuration, copyToClipboard, apiFetch } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { showToast } from '@/lib/toast';
import {
  Download,
  Film,
  Play,
  Music,
  Image as ImageIcon,
  Copy,
  Volume2,
} from 'lucide-react';

interface GalleryAsset {
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
  tags: { id: string; name: string }[];
  createdAt: string;
}

interface MediaCardProps {
  asset: GalleryAsset;
  onClick: () => void;
  selected?: boolean;
  onSelect?: () => void;
  isMultiSelectMode?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function MediaCard({ asset, onClick, selected, onSelect, isMultiSelectMode, className, style }: MediaCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const token = useAuthStore((s) => s.token);

  // Compute aspect ratio for placeholder
  const aspectRatio =
    asset.width && asset.height ? asset.width / asset.height : 1;

  const displayStorageKey = asset.previewStorageKey || asset.thumbStorageKey;
  const imageUrl = displayStorageKey
    ? `/api/v1/storage/derivatives/${displayStorageKey.replace('preview/', '')}`
    : null;

  const handleCopyLink = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/gallery?asset=${asset.id}`;
    const ok = await copyToClipboard(url);
    if (ok) showToast('success', '链接已复制');
    else showToast('error', '复制失败');
  }, [asset.id]);

  const handleDownload = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token || downloading) return;
    setDownloading(true);
    const result = await apiFetch<{ downloadUrl: string; expiresAt: string }>(
      '/download/token',
      token,
      {
        method: 'POST',
        body: JSON.stringify({ assetId: asset.id }),
      },
    );
    if (result.data) {
      window.open(result.data.downloadUrl, '_blank');
    } else {
      showToast('error', result.error || '生成下载链接失败');
    }
    setDownloading(false);
  }, [token, asset.id, downloading]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isMultiSelectMode && onSelect) {
      onSelect();
    } else {
      onClick();
    }
  }, [isMultiSelectMode, onSelect, onClick]);

  return (
    <div
      style={{
        '--photo-ratio': aspectRatio > 0 ? aspectRatio : 1,
        ...style,
      } as CSSProperties}
      className={cn(
        'photo-wall-item group relative cursor-pointer overflow-hidden bg-background-secondary transition-[box-shadow,filter,opacity] duration-150',
        className,
        selected && 'ring-2 ring-primary ring-offset-1',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`${asset.displayFilename || asset.originalFilename} - ${asset.mediaType}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e as any);
        }
      }}
    >
      <div
        className="relative h-full w-full bg-background-secondary"
      >
        {!loaded && (
          <div className="absolute inset-0 skeleton" />
        )}

        {imageUrl ? (
          <img
            ref={imgRef}
            src={imageUrl}
            alt={asset.displayFilename || asset.originalFilename}
            className={cn(
              'h-full w-full object-cover transition-opacity duration-200',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
            loading="lazy"
            onLoad={() => setLoaded(true)}
          />
        ) : (
          <div className="flex h-full min-h-[100px] items-center justify-center">
            {asset.mediaType === 'video' ? (
              <Film className="h-8 w-8 text-text-muted" />
            ) : asset.mediaType === 'audio' ? (
              <Music className="h-8 w-8 text-text-muted" />
            ) : (
              <ImageIcon className="h-8 w-8 text-text-muted" />
            )}
          </div>
        )}

        {/* Media type badge */}
        {asset.mediaType === 'gif' && (
          <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white tracking-wide">
            GIF
          </span>
        )}
        {asset.mediaType === 'video' && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <Play className="h-2.5 w-2.5 fill-white" /> MP4
          </span>
        )}
        {asset.mediaType === 'audio' && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <Volume2 className="h-2.5 w-2.5" /> MP3
          </span>
        )}

        {/* Duration badge */}
        {asset.duration && (asset.mediaType === 'video' || asset.mediaType === 'audio') && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {formatDuration(asset.duration)}
          </span>
        )}

        {/* Hover overlay */}
        <div
          className={cn(
            'absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-black/10 to-transparent p-2 transition-opacity duration-150',
            hovered ? 'opacity-100' : 'opacity-0',
          )}
        >
          <div className="w-full min-w-0">
            {asset.tags.length > 0 && (
              <div className="mb-1 flex flex-wrap gap-1">
                {asset.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur"
                  >
                    #{tag.name}
                  </span>
                ))}
                {asset.tags.length > 4 && (
                  <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] text-white">
                    +{asset.tags.length - 4}
                  </span>
                )}
              </div>
            )}
            <div className="flex w-full items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-white drop-shadow-sm">
                {asset.displayFilename || asset.originalFilename}
              </span>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  onClick={handleCopyLink}
                  className="rounded-md bg-white/20 p-1.5 text-white hover:bg-white/40 transition-colors active:scale-95"
                  aria-label="复制链接"
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="rounded-md bg-white/20 p-1.5 text-white hover:bg-white/40 transition-colors active:scale-95 disabled:opacity-50"
                  aria-label="下载"
                >
                  <Download className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Selection indicator */}
        {isMultiSelectMode && (
          <div className={cn(
            'absolute left-2 top-2 rounded-md p-0.5 transition-colors',
            selected ? 'bg-primary text-white' : 'bg-black/30 text-white/70',
          )}>
            {selected ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
