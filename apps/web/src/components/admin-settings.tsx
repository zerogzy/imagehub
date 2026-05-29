'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import {
  Save,
  HardDrive,
  Clock,
  Shield,
  Database,
  Info,
  Loader2,
} from 'lucide-react';

interface SettingsData {
  sessionCacheHours: string;
  downloadTempExpireMinutes: string;
  downloadBatchMaxExpireMinutes: string;
  uploadMaxConcurrent: string;
  trashRetentionDays: string;
  statsFlushIntervalMinutes: string;
}

export function AdminSettings() {
  const [settings, setSettings] = useState<SettingsData>({
    sessionCacheHours: '3',
    downloadTempExpireMinutes: '5',
    downloadBatchMaxExpireMinutes: '30',
    uploadMaxConcurrent: '3',
    trashRetentionDays: '30',
    statsFlushIntervalMinutes: '5',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const token = useAuthStore((s) => s.token);
  const { name, role, tokenPrefix, clearAuth } = useAuthStore();

  const loadSettings = useCallback(async () => {
    if (!token) return;
    const result = await apiFetch<SettingsData>('/admin/settings', token);
    if (result.data) setSettings(result.data);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    const result = await apiFetch<SettingsData>('/admin/settings', token, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    setSaving(false);
    if (result.error) {
      showToast('error', result.error);
      return;
    }
    if (result.data) setSettings(result.data);
    showToast('success', '设置已保存');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">系统设置</h1>
          <p className="mt-1 text-sm text-text-secondary">配置系统参数和行为</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50 sm:w-auto"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          保存设置
        </button>
      </div>

      <div className="space-y-6">
        {/* Session / Auth settings */}
        <div className="rounded-xl border border-border bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-text-primary">会话设置</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">
                登录缓存有效时长（小时）
              </label>
              <input
                type="number"
                value={settings.sessionCacheHours}
                onChange={(e) =>
                  setSettings({ ...settings, sessionCacheHours: String(Math.max(1, parseInt(e.target.value) || 3)) })
                }
                min={1}
                max={720}
                className="h-10 w-48 rounded-lg border border-border px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1 text-xs text-text-muted">默认 3 小时，在此期间刷新页面无需重新输入密钥</p>
            </div>
          </div>
        </div>

        {/* Download settings */}
        <div className="rounded-xl border border-border bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-text-primary">下载设置</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">
                短期下载链接有效期（分钟）
              </label>
              <input
                type="number"
                value={settings.downloadTempExpireMinutes}
                onChange={(e) =>
                  setSettings({ ...settings, downloadTempExpireMinutes: String(parseInt(e.target.value) || 5) })
                }
                min={1}
                max={30}
                className="h-10 w-48 rounded-lg border border-border px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1 text-xs text-text-muted">默认 5 分钟，最大 30 分钟</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">
                批量下载链接有效期（分钟）
              </label>
              <input
                type="number"
                value={settings.downloadBatchMaxExpireMinutes}
                onChange={(e) =>
                  setSettings({ ...settings, downloadBatchMaxExpireMinutes: String(parseInt(e.target.value) || 30) })
                }
                min={5}
                max={60}
                className="h-10 w-48 rounded-lg border border-border px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1 text-xs text-text-muted">默认 30 分钟</p>
            </div>
          </div>
        </div>

        {/* Upload settings */}
        <div className="rounded-xl border border-border bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-text-primary">上传设置</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">
                最大并发上传数
              </label>
              <input
                type="number"
                value={settings.uploadMaxConcurrent}
                onChange={(e) =>
                  setSettings({ ...settings, uploadMaxConcurrent: String(parseInt(e.target.value) || 3) })
                }
                min={1}
                max={10}
                className="h-10 w-48 rounded-lg border border-border px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1 text-xs text-text-muted">同时处理的上传任务数</p>
            </div>
          </div>
        </div>

        {/* Trash settings */}
        <div className="rounded-xl border border-border bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-text-primary">回收站</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">
                回收站保留天数
              </label>
              <input
                type="number"
                value={settings.trashRetentionDays}
                onChange={(e) =>
                  setSettings({ ...settings, trashRetentionDays: String(parseInt(e.target.value) || 30) })
                }
                min={7}
                max={365}
                className="h-10 w-48 rounded-lg border border-border px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1 text-xs text-text-muted">超过保留期后可永久删除</p>
            </div>
          </div>
        </div>

        {/* Stats settings */}
        <div className="rounded-xl border border-border bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-text-primary">统计设置</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">
                统计刷新间隔（分钟）
              </label>
              <input
                type="number"
                value={settings.statsFlushIntervalMinutes}
                onChange={(e) =>
                  setSettings({ ...settings, statsFlushIntervalMinutes: String(parseInt(e.target.value) || 5) })
                }
                min={1}
                max={60}
                className="h-10 w-48 rounded-lg border border-border px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1 text-xs text-text-muted">从 Redis 刷新到 MySQL 的间隔</p>
            </div>
          </div>
        </div>

        {/* Current session info */}
        <div className="rounded-xl border border-border bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-text-primary">当前会话</h2>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-text-secondary">名称:</span>
              <span className="text-text-primary">{name || '-'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-text-secondary">角色:</span>
              <span className="text-text-primary">{role === 'admin' ? '管理员' : '访客'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-text-secondary">密钥前缀:</span>
              <span className="font-mono text-text-primary">{tokenPrefix || '-'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
