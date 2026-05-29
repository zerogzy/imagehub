'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch, cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { AssetDetailMedia } from './asset-detail/asset-detail-media';
import { AssetDetailMeta } from './asset-detail/asset-detail-meta';
import { AssetDetailAdminActions } from './asset-detail/asset-detail-admin-actions';
import { useAssetDetail } from './asset-detail/use-asset-detail';
import { useAssetOriginal } from './asset-detail/use-asset-original';
import { useImageZoom } from './asset-detail/use-image-zoom';

interface AssetDetailModalProps {
  assetId: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onChanged?: () => void;
  defaultShowInfo?: boolean;
}

export function AssetDetailModal({
  assetId,
  onClose,
  onPrev,
  onNext,
  onChanged,
  defaultShowInfo = false,
}: AssetDetailModalProps) {
  const token = useAuthStore((s) => s.token);
  const isAdmin = useAuthStore((s) => s.isAdmin());

  const [showInfo, setShowInfo] = useState(defaultShowInfo);
  const [downloading, setDownloading] = useState(false);
  const { asset, loading, groups, tags, loadAsset, loadAdminOptions } = useAssetDetail({
    assetId,
    token,
    isAdmin,
  });
  const { blobUrl: originalBlobUrl, loading: originalLoading } = useAssetOriginal({
    assetId: asset?.id,
    mediaType: asset?.mediaType,
    token,
  });
  const zoom = useImageZoom();

  // 切换 asset 时重置缩放; 与 asset 加载 useEffect 解耦, 避免 hook 内引用顺序问题。
  useEffect(() => {
    zoom.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
      if (e.key === 'ArrowRight' && onNext) onNext();
      if (e.key === 'i') setShowInfo((v) => !v);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPrev, onNext]);

  const handleDownload = useCallback(async () => {
    if (!token || !asset || downloading) return;
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
      showToast('error', '生成下载链接失败');
    }
    setDownloading(false);
  }, [token, asset, downloading]);

  const handleRemoveTag = async (tagId: string) => {
    if (!token || !asset) return;
    const result = await apiFetch('/admin/assets/batch/untag', token, {
      method: 'POST',
      body: JSON.stringify({ assetIds: [asset.id], tagId }),
    });

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '标签已删除');
    await loadAsset();
    await loadAdminOptions();
    onChanged?.();
  };

  if (!asset && loading) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      </div>
    );
  }

  if (!asset) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex h-[100dvh] w-screen overflow-hidden bg-white shadow-modal animate-fade-in md:h-[90vh] md:w-[calc(100vw-32px)] md:max-w-7xl md:rounded-2xl"
        role="dialog"
        aria-label="媒体详情"
      >
        <button
          onClick={() => setShowInfo((v) => !v)}
          className="absolute left-4 top-4 z-30 rounded-full border border-border bg-white/95 p-2 text-text-secondary shadow-lg backdrop-blur transition-colors hover:bg-background-secondary hover:text-text-primary"
          aria-label="切换信息面板"
        >
          <Info className="h-5 w-5" />
        </button>

        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-30 rounded-full border border-border bg-white/95 p-2 text-text-secondary shadow-lg backdrop-blur transition-colors hover:bg-background-secondary hover:text-text-primary"
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>

        {onPrev && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            className="absolute left-6 top-1/2 z-20 hidden -translate-y-1/2 rounded-full border border-white/50 bg-black/35 p-2.5 text-white shadow-lg transition-colors hover:bg-black/55 md:block"
            aria-label="上一张"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {onNext && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className={cn(
              'absolute top-1/2 z-20 hidden -translate-y-1/2 rounded-full border border-white/40 bg-black/35 p-2.5 text-white shadow-lg transition-colors hover:bg-black/55 md:block',
              showInfo ? 'right-6 md:left-[calc(60%-64px)] md:right-auto' : 'right-6',
            )}
            aria-label="下一张"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {!showInfo && !zoom.isZoomed && (
          <>
            {onPrev && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPrev();
                }}
                className="absolute bottom-0 left-0 top-16 z-10 w-1/2 cursor-default md:hidden"
                aria-label="上一张"
              />
            )}
            {onNext && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNext();
                }}
                className="absolute bottom-0 right-0 top-16 z-10 w-1/2 cursor-default md:hidden"
                aria-label="下一张"
              />
            )}
          </>
        )}

        <AssetDetailMedia
          asset={asset}
          originalBlobUrl={originalBlobUrl}
          originalLoading={originalLoading}
          zoom={zoom}
          showInfo={showInfo}
        />

        {showInfo && (
          <div className="absolute inset-x-0 bottom-0 z-20 max-h-[52dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-white px-5 pb-6 pt-5 shadow-2xl md:static md:max-h-none md:w-2/5 md:rounded-none md:border-l md:border-t-0 md:px-6 md:pt-20 md:shadow-none">
            <AssetDetailMeta
              asset={asset}
              isAdmin={isAdmin}
              onRemoveTag={handleRemoveTag}
            />

            <div className="mt-6 space-y-2">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover transition-colors disabled:opacity-50 active:scale-[0.98]"
              >
                <Download className="h-4 w-4" />
                {downloading ? '生成链接中...' : '下载'}
              </button>

              {isAdmin && token && (
                <AssetDetailAdminActions
                  asset={asset}
                  token={token}
                  groups={groups}
                  tags={tags}
                  onReload={loadAsset}
                  onReloadOptions={loadAdminOptions}
                  onChanged={onChanged}
                  onClose={onClose}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
