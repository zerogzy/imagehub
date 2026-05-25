'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch, copyToClipboard, formatDateTime, formatFileSize } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { Copy, Download, Link2, Loader2, Trash2 } from 'lucide-react';

interface PermanentShare {
  id: string;
  shareId: string;
  downloadUrl: string;
  downloadCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
  asset: {
    id: string;
    originalFilename: string;
    displayFilename: string | null;
    mediaType: string;
    mimeType: string;
    status: string;
    sizeBytes: string;
    thumbStorageKey: string | null;
  };
}

export function AdminShares() {
  const [shares, setShares] = useState<PermanentShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingShareId, setDeletingShareId] = useState<string | null>(null);
  const token = useAuthStore((s) => s.token);

  const fetchShares = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const result = await apiFetch<{ shares: PermanentShare[] }>('/admin/shares/permanent', token);
    if (result.data) setShares(result.data.shares || []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  const handleCopy = async (share: PermanentShare) => {
    const ok = await copyToClipboard(`${window.location.origin}${share.downloadUrl}`);
    showToast(ok ? 'success' : 'error', ok ? '永久下载链接已复制' : '复制失败');
  };

  const handleDelete = async (share: PermanentShare) => {
    if (!token || deletingShareId) return;
    const confirmed = window.confirm(`删除永久下载链接？\n${share.asset.displayFilename || share.asset.originalFilename}`);
    if (!confirmed) return;

    setDeletingShareId(share.shareId);
    const result = await apiFetch(`/admin/shares/permanent/${share.shareId}`, token, { method: 'DELETE' });
    setDeletingShareId(null);

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '永久下载链接已删除');
    setShares((current) => current.filter((item) => item.shareId !== share.shareId));
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">永久下载链接</h1>
        <p className="mt-1 text-sm text-text-secondary">查看下载次数，并删除不再需要的永久链接</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : shares.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <Link2 className="mb-4 h-12 w-12" />
          <p className="text-sm">暂无永久下载链接</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background-secondary text-xs text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">资源</th>
                <th className="px-4 py-3 font-medium">链接</th>
                <th className="px-4 py-3 font-medium">下载次数</th>
                <th className="px-4 py-3 font-medium">最后下载</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shares.map((share) => (
                <tr key={share.id} className="hover:bg-background-secondary/60">
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text-primary">
                        {share.asset.displayFilename || share.asset.originalFilename}
                      </p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {share.asset.mediaType} · {formatFileSize(share.asset.sizeBytes)}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <code className="block max-w-[260px] truncate rounded bg-background-secondary px-2 py-1 text-xs text-text-secondary">
                      {share.downloadUrl}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-text-primary">
                      <Download className="h-3.5 w-3.5 text-warning" />
                      {share.downloadCount.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {share.lastAccessedAt ? formatDateTime(share.lastAccessedAt) : '未下载'}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{formatDateTime(share.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleCopy(share)}
                        className="rounded-lg border border-border p-2 text-text-secondary transition-colors hover:bg-background-secondary hover:text-primary"
                        aria-label="复制永久链接"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(share)}
                        disabled={deletingShareId === share.shareId}
                        className="rounded-lg border border-border p-2 text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                        aria-label="删除永久链接"
                      >
                        {deletingShareId === share.shareId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
