'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { KeyRound, Shield, Eye, ArrowRight } from 'lucide-react';

export function TokenEntryPage() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const setSessionCacheHours = useAuthStore((s) => s.setSessionCacheHours);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/v1/settings/public')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data?.sessionCacheHours) {
          setSessionCacheHours(json.data.sessionCacheHours);
        }
      })
      .catch(() => {});
  }, [setSessionCacheHours]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError('请输入访问密钥');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/v1/me', {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          'Content-Type': 'application/json',
        },
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error?.message || '无效的访问密钥');
        return;
      }

      const { role, tokenPrefix, name } = json.data;
      setAuth(token.trim(), role, tokenPrefix, name);

      // 登录后跳回来源地址 (含 ?asset= 深链)，仅允许站内绝对路径，防开放重定向
      const redirect = new URLSearchParams(window.location.search).get('redirect');
      const safeRedirect = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : null;
      router.push(safeRedirect || '/gallery');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <KeyRound className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">ImageHub</h1>
          <p className="mt-2 text-sm text-text-secondary">私有媒体图床系统</p>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-card">
          <form onSubmit={handleSubmit}>
            <label
              htmlFor="token"
              className="mb-2 block text-sm font-medium text-text-primary"
            >
              访问密钥
            </label>
            <div className="relative">
              <input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="请输入您的访问密钥"
                className="w-full rounded-lg border border-border bg-background px-4 py-3 pr-12 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                autoFocus
                autoComplete="off"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Shield className="h-5 w-5 text-text-muted" />
              </div>
            </div>

            {error && (
              <p className="mt-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !token.trim()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  进入图床
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-text-muted">
          密钥仅在本地存储，不会发送到第三方
        </p>
      </div>
    </div>
  );
}
