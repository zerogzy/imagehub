'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch, formatDateTime } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import {
  Database,
  Download,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Clock,
  XCircle,
  Info,
} from 'lucide-react';

interface BackupJob {
  id: string;
  jobType: string;
  status: string;
  progress: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export function AdminBackup() {
  const [exporting, setExporting] = useState(false);
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) return;
    fetchJobs();
  }, [token]);

  const fetchJobs = async () => {
    if (!token) return;
    const result = await apiFetch<BackupJob[]>('/admin/jobs?jobType=backup_export', token);
    if (result.data) setJobs((result.data as any).slice(0, 10));
  };

  const handleExport = async () => {
    if (!token) return;
    setExporting(true);
    const result = await apiFetch('/admin/backup/export', token, {
      method: 'POST',
    });
    setExporting(false);
    if (result.error) {
      showToast('error', result.error);
      return;
    }
    showToast('success', '备份导出任务已创建');
    fetchJobs();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-danger" />;
      default:
        return <Clock className="h-4 w-4 text-text-muted" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return '等待中';
      case 'running': return '运行中';
      case 'completed': return '已完成';
      case 'failed': return '失败';
      case 'cancelled': return '已取消';
      default: return status;
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">备份导出</h1>
          <p className="mt-1 text-sm text-text-secondary">导出元数据备份（不包含原图文件）</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Database className="h-4 w-4" />
          )}
          {exporting ? '导出中...' : '开始导出'}
        </button>
      </div>

      {/* Info notice */}
      <div className="mb-6 rounded-xl border border-primary/20 bg-primary-light p-4">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium text-primary-dark">备份说明</p>
            <ul className="mt-1 space-y-1 text-xs text-text-secondary">
              <li>• 备份仅包含元数据（MySQL 数据库数据），不包含原图文件</li>
              <li>• 导出内容包括：分组、标签、排序、分享链接配置、Token 配置、统计、相似度结果</li>
              <li>• 恢复时需确保 /storage/original 目录已手动备份并放回原路径</li>
              <li>• 导出文件包含 manifest.json、metadata.sql、checksums.txt</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Warning */}
      <div className="mb-6 flex items-center gap-3 rounded-lg bg-warning-light border border-warning/20 px-4 py-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <p className="text-sm text-warning-dark">
          Token 的明文不会导出，恢复后需重新生成密钥。
        </p>
      </div>

      {/* Job history */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-text-primary">导出历史</h2>
        {jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <Database className="mx-auto mb-3 h-10 w-10 text-text-muted" />
            <p className="text-sm text-text-muted">暂无导出记录</p>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-4 rounded-xl border border-border bg-white p-4"
              >
                {getStatusIcon(job.status)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {getStatusLabel(job.status)}
                    </span>
                    <span className="text-xs text-text-muted">
                      {formatDateTime(job.createdAt)}
                    </span>
                  </div>
                  {job.status === 'running' && (
                    <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  )}
                  {job.errorMessage && (
                    <p className="mt-1 text-xs text-danger">{job.errorMessage}</p>
                  )}
                </div>
                {job.status === 'completed' && (
                  <button
                    className="flex items-center gap-1 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    下载
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
