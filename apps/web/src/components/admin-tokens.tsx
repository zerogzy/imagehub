'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch, formatDateTime, formatRelativeTime, cn, copyToClipboard } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import {
  KeyRound,
  Plus,
  RotateCcw,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Shield,
  Eye,
  Copy,
  X,
  Loader2,
  AlertTriangle,
  Edit3,
} from 'lucide-react';

interface TokenItem {
  id: string;
  name: string;
  tokenPrefix: string;
  role: 'visitor' | 'admin';
  enabled: boolean;
  rotatedFromTokenId: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export function AdminTokenManager() {
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenRole, setNewTokenRole] = useState<'visitor' | 'admin'>('visitor');
  const [newTokenExpiry, setNewTokenExpiry] = useState('');
  const [newTokenCustom, setNewTokenCustom] = useState('');
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [revealedTokenPrefix, setRevealedTokenPrefix] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const token = useAuthStore((s) => s.token);

  const enabledAdminCount = useMemo(
    () => tokens.filter((t) => t.role === 'admin' && t.enabled).length,
    [tokens],
  );

  const fetchTokens = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const result = await apiFetch<TokenItem[]>('/admin/tokens', token);
    if (result.data) setTokens(result.data as any);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const handleCreate = async () => {
    if (!token || !newTokenName.trim() || creating) return;
    if (newTokenRole === 'admin' && newTokenCustom) {
      showToast('error', '管理员密钥不允许自定义值');
      return;
    }

    setCreating(true);
    try {
      const body: any = {
        name: newTokenName.trim(),
        role: newTokenRole,
        expiresAt: newTokenExpiry || undefined,
      };
      if (newTokenRole === 'visitor' && newTokenCustom) {
        body.rawToken = newTokenCustom;
      }

      const result = await apiFetch<{ id: string; tokenPrefix: string; rawToken: string }>(
        '/admin/tokens',
        token,
        { method: 'POST', body: JSON.stringify(body) },
      );

      if (result.error) {
        showToast('error', result.error);
        return;
      }

      if (result.data) {
        setRevealedToken(result.data.rawToken);
        setRevealedTokenPrefix(result.data.tokenPrefix);
      }

      showToast('success', '密钥创建成功，请立即保存！');
      setShowCreateModal(false);
      setNewTokenName('');
      setNewTokenRole('visitor');
      setNewTokenExpiry('');
      setNewTokenCustom('');
      fetchTokens();
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (t: TokenItem) => {
    if (!token) return;
    // 检查是否是最后一个启用的 admin
    if (t.role === 'admin' && t.enabled && enabledAdminCount <= 1) {
      showToast('error', '不能禁用最后一个管理员密钥');
      return;
    }
    const result = await apiFetch(`/admin/tokens/${t.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !t.enabled }),
    });
    if (result.error) {
      showToast('error', result.error);
      return;
    }
    showToast('success', t.enabled ? '密钥已禁用' : '密钥已启用');
    fetchTokens();
  };

  const handleRotate = async (tokenId: string) => {
    if (!token) return;
    if (!confirm('轮转将更换此密钥的值，旧密钥将立即失效，确定继续吗？')) return;

    const result = await apiFetch<{ id: string; tokenPrefix: string; rawToken: string }>(
      `/admin/tokens/${tokenId}/rotate`,
      token,
      { method: 'POST' },
    );

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    if (result.data) {
      setRevealedToken(result.data.rawToken);
      setRevealedTokenPrefix(result.data.tokenPrefix);
    }

    showToast('success', '密钥已轮转，请保存新密钥！');
    fetchTokens();
  };

  const handleDelete = async (t: TokenItem) => {
    if (!token || deletingId) return;
    if (t.role === 'admin' && t.enabled && enabledAdminCount <= 1) {
      showToast('error', '不能删除最后一个管理员密钥');
      return;
    }
    if (!confirm('确定要删除此密钥吗？使用此密钥的用户将无法继续访问。')) return;

    setDeletingId(t.id);
    try {
      const result = await apiFetch(`/admin/tokens/${t.id}`, token, {
        method: 'DELETE',
      });

      if (result.error) {
        showToast('error', result.error);
        return;
      }

      showToast('success', '密钥已删除');
      fetchTokens();
    } finally {
      setDeletingId(null);
    }
  };

  const isLastAdmin = (t: TokenItem) =>
    t.role === 'admin' && t.enabled && enabledAdminCount <= 1;

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
          <h1 className="text-xl font-bold text-text-primary">密钥管理</h1>
          <p className="mt-1 text-sm text-text-secondary">
            管理访客和管理员访问密钥，支持轮转和禁用
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          创建密钥
        </button>
      </div>

      {/* Revealed token banner */}
      {revealedToken && (
        <div className="mb-4 rounded-xl border border-success/30 bg-success-light p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-success-dark" />
            <span className="text-sm font-bold text-success-dark">新密钥已生成，请立即保存！此密钥只显示一次。</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-white p-3">
            <code className="flex-1 text-sm font-mono text-text-primary break-all">
              {revealedToken}
            </code>
            <button
              onClick={async () => {
                const ok = await copyToClipboard(revealedToken);
                if (ok) showToast('success', '已复制到剪贴板');
                else showToast('error', '复制失败');
              }}
              className="shrink-0 rounded-lg p-2 text-primary hover:bg-primary/10 transition-colors"
              aria-label="复制密钥"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              onClick={() => { setRevealedToken(null); setRevealedTokenPrefix(''); }}
              className="shrink-0 rounded-lg p-2 text-text-muted hover:bg-background-secondary transition-colors"
              aria-label="隐藏密钥"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-xs text-text-muted">前缀: {revealedTokenPrefix}</p>
        </div>
      )}

      {/* Token list */}
      <div className="space-y-3">
        {tokens.map((t) => (
          <div
            key={t.id}
            className={cn(
              'rounded-xl border bg-white p-4 transition-shadow hover:shadow-card-hover',
              t.enabled ? 'border-border' : 'border-danger/30 opacity-60',
            )}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className={cn(
                'shrink-0 rounded-lg p-2.5 self-start',
                t.role === 'admin' ? 'bg-warning/10' : 'bg-primary/10',
              )}>
                <KeyRound className={cn(
                  'h-5 w-5',
                  t.role === 'admin' ? 'text-warning' : 'text-primary',
                )} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-text-primary">{t.name}</span>
                  <span className={cn(
                    'rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                    t.role === 'admin'
                      ? 'bg-warning/10 text-warning'
                      : 'bg-primary/10 text-primary',
                  )}>
                    {t.role === 'admin' ? '管理员' : '访客'}
                  </span>
                  {!t.enabled && (
                    <span className="rounded-md bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                      已禁用
                    </span>
                  )}
                  {isLastAdmin(t) && (
                    <span className="rounded-md bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                      唯一管理员
                    </span>
                  )}
                </div>
                <p className="mt-1 break-words text-xs text-text-muted">
                  前缀: {t.tokenPrefix} · 创建于 {formatRelativeTime(t.createdAt)}
                  {t.lastUsedAt && ` · 最后使用 ${formatRelativeTime(t.lastUsedAt)}`}
                  {t.rotatedFromTokenId && ' · 已轮转'}
                  {t.expiresAt && ` · 过期于 ${formatDateTime(t.expiresAt)}`}
                </p>
              </div>

              <div className="flex items-center justify-end gap-1 sm:justify-start">
                <button
                  onClick={() => handleToggle(t)}
                  disabled={isLastAdmin(t)}
                  className={cn(
                    'rounded-lg p-2 transition-colors',
                    isLastAdmin(t)
                      ? 'cursor-not-allowed text-text-muted opacity-40'
                      : t.enabled
                        ? 'text-success hover:bg-success/10'
                        : 'text-text-muted hover:bg-primary/10 hover:text-primary',
                  )}
                  title={isLastAdmin(t) ? '不能禁用最后一个管理员密钥' : t.enabled ? '禁用' : '启用'}
                  aria-label={isLastAdmin(t) ? '无法禁用最后一个管理员密钥' : (t.enabled ? '禁用密钥' : '启用密钥')}
                >
                  {t.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                </button>
                <button
                  onClick={() => handleRotate(t.id)}
                  className="rounded-lg p-2 text-text-muted hover:bg-primary/10 hover:text-primary transition-colors"
                  title="轮转"
                  aria-label="轮转密钥"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(t)}
                  disabled={isLastAdmin(t)}
                  className={cn(
                    'rounded-lg p-2 transition-colors',
                    isLastAdmin(t)
                      ? 'cursor-not-allowed text-text-muted opacity-40'
                      : 'text-text-muted hover:bg-danger/10 hover:text-danger',
                  )}
                  title={isLastAdmin(t) ? '不能删除最后一个管理员密钥' : '删除'}
                  aria-label={isLastAdmin(t) ? '无法删除最后一个管理员密钥' : '删除密钥'}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {tokens.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <KeyRound className="mx-auto mb-3 h-10 w-10 text-text-muted" />
            <p className="text-sm text-text-muted">暂无密钥，点击右上角创建</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
        >
          <div className="w-full max-w-md animate-scale-in rounded-2xl bg-white p-5 shadow-modal sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">创建密钥</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1.5 text-text-muted hover:bg-background-secondary transition-colors"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-primary">
                  密钥名称 <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  placeholder="例如：我的手机、朋友访客"
                  className="h-10 w-full rounded-lg border border-border px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-primary">
                  角色
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setNewTokenRole('visitor')}
                    className={cn(
                      'flex flex-1 items-center gap-2 rounded-lg border p-3 transition-colors',
                      newTokenRole === 'visitor'
                        ? 'border-primary bg-primary-light text-primary'
                        : 'border-border text-text-secondary hover:border-primary/50',
                    )}
                  >
                    <Eye className="h-5 w-5" />
                    <div className="text-left">
                      <p className="text-sm font-medium">访客</p>
                      <p className="text-[10px] opacity-70">可浏览和下载</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTokenRole('admin')}
                    className={cn(
                      'flex flex-1 items-center gap-2 rounded-lg border p-3 transition-colors',
                      newTokenRole === 'admin'
                        ? 'border-warning bg-warning-light text-warning'
                        : 'border-border text-text-secondary hover:border-warning/50',
                    )}
                  >
                    <Shield className="h-5 w-5" />
                    <div className="text-left">
                      <p className="text-sm font-medium">管理员</p>
                      <p className="text-[10px] opacity-70">完全访问权限</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* 访客自定义 token 输入 */}
              {newTokenRole === 'visitor' && (
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-text-primary">
                    <Edit3 className="h-3.5 w-3.5" />
                    自定义密钥值（可选）
                  </label>
                  <input
                    type="text"
                    value={newTokenCustom}
                    onChange={(e) => setNewTokenCustom(e.target.value)}
                    placeholder="留空则自动生成，可设置简单值如 123"
                    className="h-10 w-full rounded-lg border border-border px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="mt-1 text-[11px] text-text-muted">
                    自定义密钥不做安全校验，可设置任意值（如 123、mypassword 等）
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-primary">
                  过期时间（可选）
                </label>
                <input
                  type="datetime-local"
                  value={newTokenExpiry}
                  onChange={(e) => setNewTokenExpiry(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-background-secondary transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!newTokenName.trim() || creating}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
