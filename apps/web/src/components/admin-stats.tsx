'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch, formatFileSize } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import {
  BarChart3,
  Eye,
  Download,
  Images,
  KeyRound,
  TrendingUp,
  Loader2,
  ArrowUpRight,
  RotateCcw,
} from 'lucide-react';

interface StatsOverview {
  totalAssets: number;
  totalViews: number;
  totalDownloads: number;
  totalTokens: number;
}

interface TopAsset {
  assetId: string;
  _sum: { detailViewCount: number | null; downloadCount: number | null };
}

export function AdminStats() {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [topViewed, setTopViewed] = useState<TopAsset[]>([]);
  const [topDownloaded, setTopDownloaded] = useState<TopAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const token = useAuthStore((s) => s.token);

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    const [overviewResult, viewedResult, downloadedResult] = await Promise.all([
      apiFetch<StatsOverview>('/admin/stats/overview', token),
      apiFetch<TopAsset[]>('/admin/stats/assets?type=views&limit=10', token),
      apiFetch<TopAsset[]>('/admin/stats/assets?type=downloads&limit=10', token),
    ]);

    if (overviewResult.data) setOverview(overviewResult.data);
    if (viewedResult.data) setTopViewed(viewedResult.data as any);
    if (downloadedResult.data) setTopDownloaded(downloadedResult.data as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleClearStats = async () => {
    if (!token || clearing) return;
    if (!window.confirm('确定要将访问统计里的浏览量和下载量清零吗？')) return;
    setClearing(true);
    const result = await apiFetch('/admin/stats/clear', token, { method: 'POST' });
    setClearing(false);

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '访问统计已清零');
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const statCards = [
    {
      label: '媒体总数',
      value: overview?.totalAssets ?? 0,
      icon: Images,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: '总浏览量',
      value: overview?.totalViews ?? 0,
      icon: Eye,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      label: '总下载量',
      value: overview?.totalDownloads ?? 0,
      icon: Download,
      color: 'text-warning',
      bg: 'bg-warning/10',
    },
    {
      label: '活跃密钥',
      value: overview?.totalTokens ?? 0,
      icon: KeyRound,
      color: 'text-purple-500',
      bg: 'bg-purple-50',
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">访问统计</h1>
          <p className="mt-1 text-sm text-text-secondary">查看系统访问和下载数据</p>
        </div>
        <button
          onClick={handleClearStats}
          disabled={clearing}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-danger/30 px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50 sm:w-auto"
        >
          {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          清零浏览和下载
        </button>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl bg-white p-5 shadow-card">
              <div className="flex items-center gap-3">
                <div className={`rounded-lg ${card.bg} p-2.5`}>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-sm text-text-secondary">{card.label}</p>
                  <p className="text-2xl font-bold text-text-primary">
                    {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Top viewed & downloaded */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top Viewed */}
        <div className="rounded-xl bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center gap-2">
            <Eye className="h-5 w-5 text-success" />
            <h2 className="text-base font-semibold text-text-primary">浏览最多</h2>
          </div>
          {topViewed.length === 0 ? (
            <p className="text-sm text-text-muted">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {topViewed.map((item, i) => (
                <div key={item.assetId} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-background-secondary transition-colors">
                  <span className="w-6 text-center text-sm font-bold text-text-muted">{i + 1}</span>
                  <span className="flex-1 truncate text-sm text-text-primary font-mono">{item.assetId.slice(0, 8)}…</span>
                  <div className="flex items-center gap-1 text-sm text-success">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    {item._sum.detailViewCount?.toLocaleString() ?? 0}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Downloaded */}
        <div className="rounded-xl bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center gap-2">
            <Download className="h-5 w-5 text-warning" />
            <h2 className="text-base font-semibold text-text-primary">下载最多</h2>
          </div>
          {topDownloaded.length === 0 ? (
            <p className="text-sm text-text-muted">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {topDownloaded.map((item, i) => (
                <div key={item.assetId} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-background-secondary transition-colors">
                  <span className="w-6 text-center text-sm font-bold text-text-muted">{i + 1}</span>
                  <span className="flex-1 truncate text-sm text-text-primary font-mono">{item.assetId.slice(0, 8)}…</span>
                  <div className="flex items-center gap-1 text-sm text-warning">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    {item._sum.downloadCount?.toLocaleString() ?? 0}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
