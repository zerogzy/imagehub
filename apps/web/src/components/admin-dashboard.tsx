'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch } from '@/lib/utils';
import { Images, Eye, Download, KeyRound, BarChart3, FolderOpen, Tags, HardDrive } from 'lucide-react';

interface StatsOverview {
  totalAssets: number;
  totalViews: number;
  totalDownloads: number;
  totalTokens: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) return;
    apiFetch<StatsOverview>('/admin/stats/overview', token).then((result) => {
      if (result.data) setStats(result.data);
    });
  }, [token]);

  const statCards = [
    {
      label: '媒体总数',
      value: stats?.totalAssets ?? '-',
      icon: Images,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: '总浏览量',
      value: stats?.totalViews ?? '-',
      icon: Eye,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      label: '总下载量',
      value: stats?.totalDownloads ?? '-',
      icon: Download,
      color: 'text-warning',
      bg: 'bg-warning/10',
    },
    {
      label: '活跃密钥',
      value: stats?.totalTokens ?? '-',
      icon: KeyRound,
      color: 'text-purple-500',
      bg: 'bg-purple-50',
    },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold text-text-primary">管理概览</h1>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl bg-white p-5 shadow-card"
            >
              <div className="flex items-center gap-3">
                <div className={`rounded-lg ${card.bg} p-2.5`}>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-sm text-text-secondary">{card.label}</p>
                  <p className="text-2xl font-bold text-text-primary">
                    {typeof card.value === 'number'
                      ? card.value.toLocaleString()
                      : card.value}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick actions */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-text-primary">快捷操作</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <button
            onClick={() => (window.location.href = '/admin/upload')}
            className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-card hover:shadow-card-hover transition-shadow"
          >
            <div className="rounded-lg bg-primary/10 p-2">
              <HardDrive className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-text-primary">上传文件</p>
              <p className="text-xs text-text-muted">单文件或批量上传</p>
            </div>
          </button>

          <button
            onClick={() => (window.location.href = '/admin/groups')}
            className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-card hover:shadow-card-hover transition-shadow"
          >
            <div className="rounded-lg bg-success/10 p-2">
              <FolderOpen className="h-5 w-5 text-success" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-text-primary">管理分组</p>
              <p className="text-xs text-text-muted">创建、排序、设置随机</p>
            </div>
          </button>

          <button
            onClick={() => (window.location.href = '/admin/tokens')}
            className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-card hover:shadow-card-hover transition-shadow"
          >
            <div className="rounded-lg bg-purple-50 p-2">
              <KeyRound className="h-5 w-5 text-purple-500" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-text-primary">管理密钥</p>
              <p className="text-xs text-text-muted">创建、轮转、禁用密钥</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
