'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch, formatFileSize, formatRelativeTime, cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  CheckSquare,
  Square,
  Loader2,
  ImageOff,
  XCircle,
} from 'lucide-react';

interface TrashItem {
  id: string;
  assetId: string;
  deleteReason: string | null;
  deletedAt: string;
  restoreUntil: string | null;
  asset: {
    id: string;
    originalFilename: string;
    mediaType: string;
    mimeType: string;
    sizeBytes: string | bigint;
    width: number | null;
    height: number | null;
    derivatives: { storageKey: string; derivativeType: string }[];
  };
}

export function AdminTrash() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const token = useAuthStore((s) => s.token);

  const fetchItems = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const result = await apiFetch<{ items: TrashItem[]; meta: { total: number; totalPages: number } }>(
      `/admin/trash?page=${page}&pageSize=20`,
      token,
    );
    if (result.data) {
      setItems(result.data.items || []);
      setTotal(result.data.meta.total);
      setTotalPages(result.data.meta.totalPages);
    }
    setLoading(false);
  }, [token, page]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleRestore = async (assetId: string) => {
    if (!token) return;
    const result = await apiFetch('/admin/trash/restore', token, {
      method: 'POST',
      body: JSON.stringify({ assetIds: [assetId] }),
    });
    if (result.error) {
      showToast('error', result.error);
      return;
    }
    showToast('success', '文件已恢复');
    fetchItems();
  };

  const handlePurge = async (assetId: string) => {
    if (!token) return;
    if (!confirm('永久删除将无法恢复，确定继续吗？')) return;
    const result = await apiFetch('/admin/trash/purge', token, {
      method: 'POST',
      body: JSON.stringify({ assetIds: [assetId] }),
    });
    if (result.error) {
      showToast('error', result.error);
      return;
    }
    showToast('success', '文件已永久删除');
    fetchItems();
  };

  const handleBatchRestore = async () => {
    if (!token || selected.size === 0) return;
    const result = await apiFetch('/admin/trash/restore', token, {
      method: 'POST',
      body: JSON.stringify({ assetIds: Array.from(selected) }),
    });
    if (result.error) {
      showToast('error', result.error);
      return;
    }
    showToast('success', `已恢复 ${selected.size} 个文件`);
    setSelected(new Set());
    fetchItems();
  };

  const handleBatchPurge = async () => {
    if (!token || selected.size === 0) return;
    if (!confirm(`永久删除 ${selected.size} 个文件将无法恢复，确定继续吗？`)) return;
    const result = await apiFetch('/admin/trash/purge', token, {
      method: 'POST',
      body: JSON.stringify({ assetIds: Array.from(selected) }),
    });
    if (result.error) {
      showToast('error', result.error);
      return;
    }
    showToast('success', `已永久删除 ${selected.size} 个文件`);
    setSelected(new Set());
    fetchItems();
  };

  const toggleSelect = (assetId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(items.map((item) => item.assetId)));
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">回收站</h1>
          <p className="mt-1 text-sm text-text-secondary">
            共 {total} 个已删除文件
          </p>
        </div>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-text-muted">已选 {selected.size} 项</span>
            <button
              onClick={handleBatchRestore}
              className="flex items-center gap-1 rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success hover:bg-success/20 transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              批量恢复
            </button>
            <button
              onClick={handleBatchPurge}
              className="flex items-center gap-1 rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/20 transition-colors"
            >
              <XCircle className="h-4 w-4" />
              批量永久删除
            </button>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="mb-3">
          <button
            onClick={selectAll}
            className="flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-primary"
          >
            {selected.size === items.length ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            全选当前页
          </button>
        </div>
      )}

      {/* Warning */}
      <div className="mb-4 flex items-center gap-3 rounded-lg bg-warning-light border border-warning/20 px-4 py-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <p className="text-sm text-warning-dark">
          永久删除将移除所有文件数据且无法恢复。建议先恢复确认再删除。
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <Trash2 className="mb-4 h-12 w-12" />
          <p className="text-sm">回收站为空</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const thumbDerivative = item.asset.derivatives?.find((d) => d.derivativeType === 'thumb');
            const thumbUrl = thumbDerivative
              ? `/api/v1/storage/derivatives/${thumbDerivative.storageKey.replace('preview/', '')}`
              : null;

            return (
              <div
                key={item.id}
                className={cn(
                  'flex items-center gap-4 rounded-xl border bg-white p-4 transition-shadow hover:shadow-card-hover',
                  selected.has(item.assetId) ? 'border-primary ring-2 ring-primary/20' : 'border-border',
                )}
              >
                {/* Select */}
                <button
                  onClick={() => toggleSelect(item.assetId)}
                  className="shrink-0"
                  aria-label={selected.has(item.assetId) ? '取消选择' : '选择'}
                >
                  {selected.has(item.assetId) ? (
                    <CheckSquare className="h-5 w-5 text-primary" />
                  ) : (
                    <Square className="h-5 w-5 text-text-muted" />
                  )}
                </button>

                {/* Thumbnail */}
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-background-secondary">
                  {thumbUrl ? (
                    <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImageOff className="h-6 w-6 text-text-muted" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {item.asset.originalFilename}
                  </p>
                  <p className="text-xs text-text-muted">
                    {formatFileSize(item.asset.sizeBytes.toString())}
                    {item.asset.width && item.asset.height && ` · ${item.asset.width}×${item.asset.height}`}
                    {' · 删除于 '}{formatRelativeTime(item.deletedAt)}
                  </p>
                  {item.deleteReason && (
                    <p className="text-xs text-text-muted">原因: {item.deleteReason}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRestore(item.assetId)}
                    className="flex items-center gap-1 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    恢复
                  </button>
                  <button
                    onClick={() => handlePurge(item.assetId)}
                    className="flex items-center gap-1 rounded-lg bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 transition-colors"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    永久删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-background-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            上一页
          </button>
          <span className="text-sm text-text-muted">第 {page} / {totalPages} 页</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-background-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
