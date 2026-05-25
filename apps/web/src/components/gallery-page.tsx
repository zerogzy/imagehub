'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useGalleryStore } from '@/stores/gallery-store';
import { apiFetch } from '@/lib/utils';
import { JustifiedPhotoWall } from './justified-photo-wall';
import { AssetDetailModal } from './asset-detail-modal';
import { MediaType } from '@imagehub/shared';
import { Loader2, ImageOff } from 'lucide-react';

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
  previewStorageKey: string | null;
  groups: { groupId: string; groupName: string; groupSlug: string; subgroupId: string | null; subgroupName: string | null; rankKey: string }[];
  tags: { id: string; name: string; source: string }[];
  createdAt: string;
}

interface GalleryResponse {
  assets?: GalleryAsset[];
  hits?: any[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export function GalleryPage() {
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);
  const [meta, setMeta] = useState({ page: 1, pageSize: 40, total: 0, totalPages: 0 });
  const sentinelRef = useRef<HTMLDivElement>(null);

  const token = useAuthStore((s) => s.token);
  const { currentGroupId, currentSubgroupId, sortMode, mediaType, selectedTag, searchQuery, currentSeed } =
    useGalleryStore();

  const fetchGallery = useCallback(
    async (pageNum: number, append = false) => {
      if (!token) return;
      setLoading(true);

      const params = new URLSearchParams();
      params.set('page', pageNum.toString());
      params.set('pageSize', '80');
      if (currentGroupId) params.set('groupId', currentGroupId);
      if (currentSubgroupId) params.set('subgroupId', currentSubgroupId);
      if (sortMode) params.set('sortMode', sortMode);
      if (mediaType) params.set('mediaType', mediaType);
      if (selectedTag) params.set('tag', selectedTag);
      if (currentSeed) params.set('seed', currentSeed);

      const endpoint = searchQuery
        ? currentGroupId
          ? `/search/group?groupId=${currentGroupId}&q=${encodeURIComponent(searchQuery)}&${params.toString()}`
          : `/search/global?q=${encodeURIComponent(searchQuery)}&${params.toString()}`
        : `/gallery?${params.toString()}`;

      const result = await apiFetch<GalleryResponse>(endpoint, token);

      if (result.data) {
        // 搜索返回 hits，画廊返回 assets，两者兼容
        const newAssets = result.data.assets || result.data.hits || [];
        setAssets((prev) => append ? [...prev, ...newAssets] : newAssets);
        setMeta(result.data.meta);
        setHasMore(pageNum < result.data.meta.totalPages);
      }

      setLoading(false);
    },
    [token, currentGroupId, currentSubgroupId, sortMode, mediaType, selectedTag, searchQuery, currentSeed],
  );

  useEffect(() => {
    setPage(1);
    fetchGallery(1, false);
  }, [currentGroupId, currentSubgroupId, sortMode, mediaType, selectedTag, searchQuery, currentSeed]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchGallery(nextPage, true);
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, page, fetchGallery]);

  const currentIndex = assets.findIndex((a) => a.id === detailAssetId);
  const handlePrev = currentIndex > 0 ? () => setDetailAssetId(assets[currentIndex - 1].id) : undefined;
  const handleNext = currentIndex < assets.length - 1 ? () => setDetailAssetId(assets[currentIndex + 1].id) : undefined;

  return (
    <div className="p-4 pt-14 md:pt-4">
      {/* Media type filter tabs */}
      <div className="mb-4 flex items-center gap-2">
        {[
          { label: '全部', value: null },
          { label: '图片', value: MediaType.IMAGE },
          { label: 'GIF', value: MediaType.GIF },
          { label: '视频', value: MediaType.VIDEO },
          { label: '音频', value: MediaType.AUDIO },
        ].map((tab) => (
          <button
            key={tab.value || 'all'}
            onClick={() => useGalleryStore.getState().setMediaType(tab.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              mediaType === tab.value
                ? 'bg-primary text-white'
                : 'bg-white text-text-secondary hover:bg-primary/10 hover:text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}

        <span className="ml-auto text-xs text-text-muted">
          共 {meta.total} 项
        </span>
      </div>

      {/* Justified photo wall */}
      {assets.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <ImageOff className="mb-4 h-12 w-12" />
          <p className="text-sm">暂无媒体文件</p>
        </div>
      ) : (
        <JustifiedPhotoWall assets={assets} onAssetClick={(asset) => setDetailAssetId(asset.id)} />
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {/* Detail modal */}
      {detailAssetId && (
        <AssetDetailModal
          assetId={detailAssetId}
          onClose={() => setDetailAssetId(null)}
          onPrev={handlePrev}
          onNext={handleNext}
        />
      )}
    </div>
  );
}
