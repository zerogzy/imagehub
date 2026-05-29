'use client';

import { useEffect, useState, useCallback, useRef, type MouseEvent } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch, formatFileSize, formatDuration, cn, copyToClipboard, formatDateTime } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import {
  X,
  Download,
  Copy,
  Tag,
  FolderOpen,
  Calendar,
  Maximize2,
  Play,
  Music,
  Film,
  Volume2,
  Share2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Info,
  Trash2,
  MoveRight,
  Loader2,
} from 'lucide-react';

interface AssetDetail {
  id: string;
  originalFilename: string;
  displayFilename: string | null;
  storageKey: string;
  mimeType: string;
  mediaType: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  sizeBytes: string;
  status: string;
  createdAt: string;
  derivatives: { id: string; derivativeType: string; storageKey: string; width: number | null; height: number | null }[];
  groupAssets: { group: { id: string; name: string; slug: string }; subgroup: { id: string; name: string } | null }[];
  assetTags: { tag: { id: string; name: string }; source: string }[];
  downloadShares?: { id: string; shareId: string; downloadCount: number; lastAccessedAt: string | null; createdAt: string }[];
  stats?: { viewCount: number; downloadCount: number };
}

interface GroupItem {
  id: string;
  name: string;
  subgroups?: { id: string; name: string }[];
}

interface TagItem {
  id: string;
  name: string;
}

interface AssetDetailModalProps {
  assetId: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onChanged?: () => void;
  defaultShowInfo?: boolean;
}

export function AssetDetailModal({ assetId, onClose, onPrev, onNext, onChanged, defaultShowInfo = false }: AssetDetailModalProps) {
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(defaultShowInfo);
  const [downloading, setDownloading] = useState(false);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [selectedTagId, setSelectedTagId] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [applyingTag, setApplyingTag] = useState(false);
  const [moveGroupId, setMoveGroupId] = useState('');
  const [moveSubgroupId, setMoveSubgroupId] = useState('');
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [zoom, setZoom] = useState({
    scale: 1,
    originX: 0,
    originY: 0,
    offsetX: 0,
    offsetY: 0,
  });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const token = useAuthStore((s) => s.token);
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const isZoomed = zoom.scale > 1;

  useEffect(() => {
    if (!token) return;
    resetZoom();
    loadAsset();
    loadAdminOptions();
  }, [assetId, token]);

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

  const loadAsset = async () => {
    setLoading(true);
    const result = await apiFetch<AssetDetail>(`/assets/${assetId}`, token!);
    if (result.data) {
      setAsset(result.data);
    }
    setLoading(false);
  };

  const loadAdminOptions = async () => {
    if (!token || !isAdmin) return;
    const [groupsResult, tagsResult] = await Promise.all([
      apiFetch<GroupItem[]>('/groups', token),
      apiFetch<TagItem[]>('/tags', token),
    ]);
    if (groupsResult.data) setGroups(groupsResult.data);
    if (tagsResult.data) setTags(tagsResult.data);
  };

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

  const handleCreatePermanentShare = useCallback(async () => {
    if (!token || !asset) return;
    const result = await apiFetch<{ shareId: string }>(
      '/admin/shares/permanent',
      token,
      {
        method: 'POST',
        body: JSON.stringify({ assetId: asset.id }),
      },
    );
    if (result.data) {
      showToast('success', '永久下载链接已创建');
      loadAsset();
    } else {
      showToast('error', '创建永久链接失败');
    }
  }, [token, asset]);

  const handleApplyTag = async () => {
    if (!token || !asset || applyingTag) return;
    const names = tagInput.split(/[,，、\s]+/).map((name) => name.trim()).filter(Boolean);
    if (!selectedTagId && names.length === 0) return;

    setApplyingTag(true);
    const result = await apiFetch('/admin/assets/batch/tag', token, {
      method: 'POST',
      body: JSON.stringify({
        assetIds: [asset.id],
        ...(selectedTagId ? { tagId: selectedTagId } : { names }),
        source: 'admin',
      }),
    });
    setApplyingTag(false);

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '标签已添加');
    setSelectedTagId('');
    setTagInput('');
    await loadAsset();
    await loadAdminOptions();
    onChanged?.();
  };

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

  const handleMoveAsset = async () => {
    const targetGroupId = moveGroupId || asset?.groupAssets[0]?.group.id || groups[0]?.id || '';
    if (!token || !asset || !targetGroupId || moving) return;
    setMoving(true);
    const result = await apiFetch('/admin/assets/move-to-group', token, {
      method: 'POST',
      body: JSON.stringify({
        assetIds: [asset.id],
        groupId: targetGroupId,
        subgroupId: moveSubgroupId || undefined,
      }),
    });
    setMoving(false);

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '已移动至分组');
    await loadAsset();
    onChanged?.();
  };

  const handleDeleteAsset = async () => {
    if (!token || !asset || deleting) return;
    if (!window.confirm('确定要将此文件移到回收站吗？')) return;
    setDeleting(true);
    const result = await apiFetch(`/admin/assets/${asset.id}`, token, { method: 'DELETE' });
    setDeleting(false);

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '已移到回收站');
    onChanged?.();
    onClose();
  };

  const resetZoom = () => {
    setZoom({ scale: 1, originX: 0, originY: 0, offsetX: 0, offsetY: 0 });
    setIsDraggingImage(false);
  };

  const handleImageDoubleClick = (e: MouseEvent<HTMLImageElement>) => {
    if (isZoomed) {
      resetZoom();
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

  const handleImageMouseDown = (e: MouseEvent<HTMLImageElement>) => {
    if (!isZoomed) return;
    e.preventDefault();
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: zoom.offsetX,
      offsetY: zoom.offsetY,
    };
    setIsDraggingImage(true);
  };

  const handleImageMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDraggingImage) return;
    const dragStart = dragStartRef.current;
    setZoom((current) => ({
      ...current,
      offsetX: dragStart.offsetX + e.clientX - dragStart.x,
      offsetY: dragStart.offsetY + e.clientY - dragStart.y,
    }));
  };

  const handleImageMouseUp = () => {
    setIsDraggingImage(false);
  };

  if (!asset && loading) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      </div>
    );
  }

  if (!asset) return null;

  const originalUrl = `/api/v1/storage/originals/${asset.storageKey.replace('original/', '')}`;
  const currentGroup = asset.groupAssets[0];
  const activeMoveGroupId = moveGroupId || currentGroup?.group.id || groups[0]?.id || '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex h-[100dvh] w-screen overflow-hidden bg-white shadow-modal animate-fade-in md:h-[90vh] md:w-[calc(100vw-32px)] md:max-w-7xl md:rounded-2xl"
        role="dialog"
        aria-label="媒体详情"
      >
        {/* Toggle info panel */}
        <button
          onClick={() => setShowInfo((v) => !v)}
          className="absolute left-4 top-4 z-30 rounded-full border border-border bg-white/95 p-2 text-text-secondary shadow-lg backdrop-blur transition-colors hover:bg-background-secondary hover:text-text-primary"
          aria-label="切换信息面板"
        >
          <Info className="h-5 w-5" />
        </button>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-30 rounded-full border border-border bg-white/95 p-2 text-text-secondary shadow-lg backdrop-blur transition-colors hover:bg-background-secondary hover:text-text-primary"
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Navigation arrows */}
        {onPrev && (
          <button
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            className="absolute left-6 top-1/2 z-20 hidden -translate-y-1/2 rounded-full border border-white/50 bg-black/35 p-2.5 text-white shadow-lg transition-colors hover:bg-black/55 md:block"
            aria-label="上一张"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {onNext && (
          <button
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            className={cn(
              'absolute top-1/2 z-20 hidden -translate-y-1/2 rounded-full border border-white/40 bg-black/35 p-2.5 text-white shadow-lg transition-colors hover:bg-black/55 md:block',
              showInfo ? 'right-6 md:left-[calc(60%-64px)] md:right-auto' : 'right-6',
            )}
            aria-label="下一张"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {!showInfo && !isZoomed && (
          <>
            {onPrev && (
              <button
                onClick={(e) => { e.stopPropagation(); onPrev(); }}
                className="absolute bottom-0 left-0 top-16 z-10 w-1/2 cursor-default md:hidden"
                aria-label="上一张"
              />
            )}
            {onNext && (
              <button
                onClick={(e) => { e.stopPropagation(); onNext(); }}
                className="absolute bottom-0 right-0 top-16 z-10 w-1/2 cursor-default md:hidden"
                aria-label="下一张"
              />
            )}
          </>
        )}

        {/* Media preview */}
        <div className={cn(
          'flex w-full items-center justify-center overflow-hidden bg-black/5 px-3 pb-4 pt-16 transition-all duration-200 md:px-24 md:pb-5 md:pt-20',
          showInfo ? 'md:w-3/5' : 'md:w-full',
        )}
          onMouseMove={handleImageMouseMove}
          onMouseUp={handleImageMouseUp}
          onMouseLeave={handleImageMouseUp}
        >
          {asset.mediaType === 'video' ? (
            <div className="relative flex aspect-video w-full items-center justify-center rounded-lg bg-black overflow-hidden">
              <video
                src={originalUrl}
                controls
                autoPlay
                className="h-full w-full object-contain"
              >
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
            <img
              src={originalUrl}
              alt={asset.displayFilename || asset.originalFilename}
              draggable={false}
              onDoubleClick={handleImageDoubleClick}
              onMouseDown={handleImageMouseDown}
              className={cn(
                'max-h-[calc(100dvh-96px)] max-w-full select-none rounded-lg object-contain md:max-h-[calc(90vh-100px)]',
                isDraggingImage ? 'cursor-grabbing' : isZoomed ? 'cursor-grab' : 'cursor-zoom-in',
              )}
              style={{
                transform: `translate(${zoom.offsetX}px, ${zoom.offsetY}px) scale(${zoom.scale})`,
                transformOrigin: `${zoom.originX}px ${zoom.originY}px`,
                transition: isDraggingImage ? 'none' : 'transform 160ms ease-out',
              }}
            />
          )}
        </div>

        {/* Info panel */}
        {showInfo && (
          <div className="absolute inset-x-0 bottom-0 z-20 max-h-[52dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-white px-5 pb-6 pt-5 shadow-2xl md:static md:max-h-none md:w-2/5 md:rounded-none md:border-l md:border-t-0 md:px-6 md:pt-20 md:shadow-none">
            <h2 className="text-lg font-semibold text-text-primary">
              {asset.displayFilename || asset.originalFilename}
            </h2>

            {/* Meta info */}
            <div className="mt-4 space-y-2.5">
              {asset.width && asset.height && (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Maximize2 className="h-4 w-4 text-text-muted" />
                  <span>{asset.width} × {asset.height}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Calendar className="h-4 w-4 text-text-muted" />
                <span>{formatDateTime(asset.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Film className="h-4 w-4 text-text-muted" />
                <span>{formatFileSize(asset.sizeBytes.toString())} · {asset.mimeType}</span>
              </div>
              {asset.duration && (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Play className="h-4 w-4 text-text-muted" />
                  <span>时长: {formatDuration(asset.duration)}</span>
                </div>
              )}
              {asset.stats && (
                <>
                  <div className="flex items-center gap-2 text-sm text-text-secondary">
                    <Eye className="h-4 w-4 text-text-muted" />
                    <span>浏览量: {asset.stats.viewCount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-text-secondary">
                    <Download className="h-4 w-4 text-text-muted" />
                    <span>下载量: {asset.stats.downloadCount.toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>

            {/* Groups */}
            {asset.groupAssets.length > 0 && (
              <div className="mt-5">
                <h3 className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                  <FolderOpen className="h-4 w-4" />
                  分组
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {asset.groupAssets.map((ga, i) => (
                    <span
                      key={i}
                      className="rounded-md bg-background-secondary px-2.5 py-1 text-xs text-text-secondary"
                    >
                      {ga.group.name}
                      {ga.subgroup && ` / ${ga.subgroup.name}`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {asset.assetTags.length > 0 && (
              <div className="mt-5">
                <h3 className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                  <Tag className="h-4 w-4" />
                  标签
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {asset.assetTags.map((at) => (
                    <span
                      key={at.tag.id}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs text-primary font-medium"
                    >
                      {at.tag.name}
                      {isAdmin && (
                        <button
                          onClick={() => handleRemoveTag(at.tag.id)}
                          className="rounded text-primary hover:text-danger"
                          aria-label="删除标签"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 space-y-2">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover transition-colors disabled:opacity-50 active:scale-[0.98]"
              >
                <Download className="h-4 w-4" />
                {downloading ? '生成链接中...' : '下载'}
              </button>

              {/* Admin actions */}
              {isAdmin && (
                <>
                  <button
                    onClick={handleCreatePermanentShare}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-background-secondary transition-colors"
                  >
                    <Share2 className="h-4 w-4" />
                    生成永久下载链接
                  </button>

                  <div className="rounded-lg border border-border p-3">
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text-primary">
                      <Tag className="h-3.5 w-3.5" />
                      打标签
                    </h4>
                    <div className="space-y-2">
                      <input
                        value={tagInput}
                        onChange={(e) => { setTagInput(e.target.value); if (e.target.value) setSelectedTagId(''); }}
                        placeholder="输入新标签，多个用空格或逗号分隔"
                        disabled={applyingTag}
                        className="h-9 w-full rounded-lg border border-border px-3 text-xs text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <select
                        value={selectedTagId}
                        onChange={(e) => { setSelectedTagId(e.target.value); if (e.target.value) setTagInput(''); }}
                        disabled={applyingTag}
                        className="h-9 w-full rounded-lg border border-border px-3 text-xs text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">选择已有标签</option>
                        {tags.map((tagItem) => (
                          <option key={tagItem.id} value={tagItem.id}>{tagItem.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleApplyTag}
                        disabled={applyingTag || (!selectedTagId && !tagInput.trim())}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
                      >
                        {applyingTag ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tag className="h-3.5 w-3.5" />}
                        添加标签
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-3">
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text-primary">
                      <MoveRight className="h-3.5 w-3.5" />
                      移动至分组
                    </h4>
                    <div className="space-y-2">
                      <select
                        value={activeMoveGroupId}
                        onChange={(e) => { setMoveGroupId(e.target.value); setMoveSubgroupId(''); }}
                        disabled={moving}
                        className="h-9 w-full rounded-lg border border-border px-3 text-xs text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">请选择分组</option>
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>{group.name}</option>
                        ))}
                      </select>
                      <select
                        value={moveSubgroupId || currentGroup?.subgroup?.id || ''}
                        onChange={(e) => setMoveSubgroupId(e.target.value)}
                        disabled={moving || !activeMoveGroupId}
                        className="h-9 w-full rounded-lg border border-border px-3 text-xs text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">不指定子分组</option>
                        {groups.find((group) => group.id === activeMoveGroupId)?.subgroups?.map((subgroup) => (
                          <option key={subgroup.id} value={subgroup.id}>{subgroup.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleMoveAsset}
                        disabled={moving || !activeMoveGroupId}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-background-secondary disabled:opacity-50"
                      >
                        {moving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoveRight className="h-3.5 w-3.5" />}
                        移动
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleDeleteAsset}
                    disabled={deleting}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-danger/30 px-4 py-2.5 text-sm font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    删除图片
                  </button>

                  {/* Permanent shares */}
                  {asset.downloadShares && asset.downloadShares.length > 0 && (
                    <div className="mt-4 rounded-lg bg-background-secondary p-3">
                      <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
                        <Share2 className="h-3.5 w-3.5" />
                        永久下载链接
                      </h4>
                      <div className="mt-2 space-y-2">
                        {asset.downloadShares.map((share) => (
                          <div key={share.id} className="flex items-center gap-2 text-xs text-text-muted">
                            <code className="flex-1 truncate rounded bg-white px-1.5 py-0.5 text-[11px]">
                              /share/download/{share.shareId}
                            </code>
                            <span className="shrink-0">下载 {share.downloadCount} 次</span>
                            <button
                              onClick={async () => {
                                const url = `${window.location.origin}/api/v1/share/download/${share.shareId}`;
                                const ok = await copyToClipboard(url);
                                if (ok) showToast('success', '永久链接已复制');
                              }}
                              className="shrink-0 rounded p-0.5 text-primary hover:bg-primary/10 transition-colors"
                              aria-label="复制永久链接"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
