'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch, cn, formatFileSize } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import {
  GitCompareArrows,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  Loader2,
  ImageOff,
  Layers,
} from 'lucide-react';

interface Derivative {
  id: string;
  storageKey: string;
  width: number | null;
  height: number | null;
}

interface SimilarityAsset {
  id: string;
  originalFilename: string;
  mediaType: string;
  width: number | null;
  height: number | null;
  sizeBytes: string;
  qualityScore: number | null;
  derivatives: Derivative[];
}

interface SimilarityCandidate {
  id: string;
  assetAId: string;
  assetBId: string;
  sha256Equal: boolean;
  phashDistance: number | null;
  dhashDistance: number | null;
  ssimScore: number | null;
  diffAreaRatio: number | null;
  similarityType: string;
  qualityWinnerAssetId: string | null;
  status: string;
  createdAt: string;
  assetA?: SimilarityAsset;
  assetB?: SimilarityAsset;
}

const SIMILARITY_TYPE_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  exact_duplicate: { label: '完全重复', color: 'text-danger', icon: XCircle },
  highly_similar: { label: '高度近似', color: 'text-warning', icon: AlertTriangle },
  possible_variant: { label: '疑似差分', color: 'text-primary', icon: Layers },
  same_topic: { label: '同主题', color: 'text-text-secondary', icon: Eye },
  unrelated: { label: '不相关', color: 'text-text-muted', icon: CheckCircle },
};

function getThumbUrl(asset?: SimilarityAsset): string | null {
  const thumb = asset?.derivatives?.[0];
  if (!thumb) return null;
  return `/api/v1/storage/derivatives/${thumb.storageKey.replace('preview/', '')}`;
}

export function SimilarityReview() {
  const [candidates, setCandidates] = useState<SimilarityCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('pending');

  const token = useAuthStore((s) => s.token);

  const fetchCandidates = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const result = await apiFetch<{ candidates: SimilarityCandidate[] }>(
      `/admin/similarity/candidates?status=${filter}`,
      token,
    );
    if (result.data) setCandidates(result.data.candidates || []);
    setLoading(false);
  }, [token, filter]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  const handleScan = async () => {
    if (!token) return;
    setScanning(true);
    setScanMessage('扫描正在执行，请等待结果...');
    const result = await apiFetch<{
      jobId: string;
      status: string;
      progress: number;
      result: { assetsScanned: number; candidatesFound: number; candidatesCreated: number; candidatesUpdated: number } | null;
      errorMessage?: string | null;
    }>('/admin/similarity/scan', token, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setScanning(false);
    if (result.error) {
      setScanMessage('扫描失败');
      showToast('error', result.error);
      return;
    }
    if (result.data?.status === 'completed') {
      const scanResult = result.data.result;
      const message = scanResult
        ? `扫描完成：已扫描 ${scanResult.assetsScanned} 张图片，发现 ${scanResult.candidatesFound} 组候选，新增 ${scanResult.candidatesCreated} 组。`
        : '扫描完成';
      setScanMessage(message);
      showToast('success', message);
      fetchCandidates();
    } else if (result.data?.status === 'failed') {
      const message = result.data.errorMessage || '扫描失败';
      setScanMessage(message);
      showToast('error', message);
    } else {
      setScanMessage(`扫描任务已提交，当前进度 ${result.data?.progress ?? 0}%`);
      showToast('success', '扫描任务已提交');
    }
  };

  const handleResolve = async (candidateId: string, status: string) => {
    if (!token) return;
    const result = await apiFetch('/admin/similarity/resolve', token, {
      method: 'POST',
      body: JSON.stringify({ candidateId, status }),
    });
    if (result.error) {
      showToast('error', result.error);
      return;
    }
    showToast('success', '审核操作已完成');
    fetchCandidates();
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">相似度审核</h1>
          <p className="mt-1 text-sm text-text-secondary">
            系统检测到的相似图片需要管理员确认
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50 sm:w-auto"
        >
          {scanning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GitCompareArrows className="h-4 w-4" />
          )}
          {scanning ? '扫描中...' : '开始扫描'}
        </button>
      </div>

      {scanMessage && (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-text-primary">
          {scanMessage}
        </div>
      )}

      {/* Filter tabs */}
      <div className="mb-4 flex items-center gap-2">
        {[
          { label: '待审核', value: 'pending' },
          { label: '已处理', value: 'resolved' },
          { label: '已忽略', value: 'ignored' },
          { label: '全部', value: '' },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              filter === tab.value
                ? 'bg-primary text-white'
                : 'bg-white text-text-secondary hover:bg-primary/10 hover:text-primary',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Candidates list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <GitCompareArrows className="mb-4 h-12 w-12" />
          <p className="text-sm">暂无相似度审核候选</p>
          <p className="mt-1 text-xs">点击"开始扫描"检测相似图片</p>
        </div>
      ) : (
        <div className="space-y-4">
          {candidates.map((candidate) => {
            const typeInfo = SIMILARITY_TYPE_LABELS[candidate.similarityType] || SIMILARITY_TYPE_LABELS.unrelated;
            const TypeIcon = typeInfo.icon;
            const thumbA = getThumbUrl(candidate.assetA);
            const thumbB = getThumbUrl(candidate.assetB);
            return (
              <div
                key={candidate.id}
                className="rounded-xl border border-border bg-white p-4"
              >
                {/* Type badge */}
                <div className="mb-3 flex items-center gap-2">
                  <TypeIcon className={cn('h-4 w-4', typeInfo.color)} />
                  <span className={cn('text-sm font-medium', typeInfo.color)}>
                    {typeInfo.label}
                  </span>
                  {candidate.sha256Equal && (
                    <span className="rounded-md bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                      SHA256 相同
                    </span>
                  )}
                  {candidate.ssimScore !== null && (
                    <span className="text-xs text-text-muted">
                      SSIM: {(candidate.ssimScore * 100).toFixed(1)}%
                    </span>
                  )}
                  {candidate.phashDistance !== null && (
                    <span className="text-xs text-text-muted">
                      pHash距离: {candidate.phashDistance}
                    </span>
                  )}
                </div>

                {/* Image comparison */}
                <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-background-secondary p-2">
                    <p className="mb-1 truncate text-xs text-text-secondary">
                      A: {candidate.assetA?.originalFilename || candidate.assetAId}
                    </p>
                    <div className="aspect-video flex items-center justify-center rounded bg-background">
                      {thumbA ? (
                        <img
                          src={thumbA}
                          alt="Asset A"
                          className="max-h-32 object-contain"
                        />
                      ) : (
                        <ImageOff className="h-8 w-8 text-text-muted" />
                      )}
                    </div>
                    {candidate.assetA && (
                      <p className="mt-1 text-[10px] text-text-muted">
                        {candidate.assetA.width}×{candidate.assetA.height} · {formatFileSize(candidate.assetA.sizeBytes)}
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg border border-border bg-background-secondary p-2">
                    <p className="mb-1 truncate text-xs text-text-secondary">
                      B: {candidate.assetB?.originalFilename || candidate.assetBId}
                    </p>
                    <div className="aspect-video flex items-center justify-center rounded bg-background">
                      {thumbB ? (
                        <img
                          src={thumbB}
                          alt="Asset B"
                          className="max-h-32 object-contain"
                        />
                      ) : (
                        <ImageOff className="h-8 w-8 text-text-muted" />
                      )}
                    </div>
                    {candidate.assetB && (
                      <p className="mt-1 text-[10px] text-text-muted">
                        {candidate.assetB.width}×{candidate.assetB.height} · {formatFileSize(candidate.assetB.sizeBytes)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {candidate.status === 'pending' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleResolve(candidate.id, 'kept_both')}
                      className="flex items-center gap-1 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20 transition-colors"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      保留两张
                    </button>
                    <button
                      onClick={() => handleResolve(candidate.id, 'delete_a')}
                      className="flex items-center gap-1 rounded-lg bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 transition-colors"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      删除 A
                    </button>
                    <button
                      onClick={() => handleResolve(candidate.id, 'delete_b')}
                      className="flex items-center gap-1 rounded-lg bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 transition-colors"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      删除 B
                    </button>
                    <button
                      onClick={() => handleResolve(candidate.id, 'marked_variant')}
                      className="flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      标记为差分
                    </button>
                    <button
                      onClick={() => handleResolve(candidate.id, 'ignored')}
                      className="flex items-center gap-1 rounded-lg bg-background-secondary px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-border transition-colors"
                    >
                      忽略
                    </button>
                  </div>
                )}

                {candidate.status !== 'pending' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-background-secondary px-2 py-1 text-xs text-text-muted">
                    已处理: {candidate.status}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
