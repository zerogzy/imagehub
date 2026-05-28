'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useGalleryStore } from '@/stores/gallery-store';
import {
  Search,
  Shuffle,
  Pin,
  Link2,
  LogOut,
  Settings,
  Upload,
  Image,
} from 'lucide-react';
import { apiFetch } from '@/lib/utils';

export function GalleryHeader() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'global' | 'group'>('global');
  const { token, role, clearAuth, name } = useAuthStore();
  const { currentSeed, setSeed, currentGroupId } = useGalleryStore();
  const router = useRouter();

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      useGalleryStore.getState().setSearchQuery(searchQuery);
    },
    [searchQuery],
  );

  const handleCopyViewLink = useCallback(() => {
    const params = new URLSearchParams();
    const state = useGalleryStore.getState();
    if (state.currentGroupId) params.set('group', state.currentGroupId);
    if (state.currentSeed) params.set('seed', state.currentSeed);
    const url = `${window.location.origin}/gallery?${params.toString()}`;
    navigator.clipboard.writeText(url);
  }, []);

  const handleLogout = () => {
    clearAuth();
    router.replace('/');
  };

  return (
    <header className="flex flex-wrap items-center gap-y-2 border-b border-border bg-white px-3 py-2 md:h-14 md:flex-nowrap md:gap-3 md:px-4 md:py-0">
      {/* Logo */}
      <div className="flex shrink-0 items-center gap-2">
        <Image className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold text-text-primary">ImageHub</span>
      </div>

      {/* Actions: 手机端被 ml-auto 推到第一行右侧；桌面端 md:order-3 放到搜索框之后 */}
      <div className="ml-auto flex items-center gap-1 md:order-3 md:ml-0">
        {/* Seed status - 手机端仅显示图标和取消按钮，桌面端显示种子串 */}
        {currentSeed && (
          <div className="flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-1 text-xs text-primary md:px-2">
            <Shuffle className="h-3 w-3" />
            <span className="hidden sm:inline">{currentSeed.slice(0, 8)}</span>
            <button
              onClick={() => setSeed(null)}
              className="ml-0.5 rounded p-0.5 hover:bg-primary/20"
              title="取消固定"
              aria-label="取消固定随机种子"
            >
              <Pin className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Copy link */}
        <button
          onClick={handleCopyViewLink}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-primary/10 hover:text-primary md:w-auto md:px-3"
          title="复制当前视图链接"
          aria-label="复制当前视图链接"
        >
          <Link2 className="h-4 w-4" />
        </button>

        {/* Admin actions */}
        {role === 'admin' && (
          <button
            onClick={() => router.push('/admin')}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-primary/10 hover:text-primary md:w-auto md:px-3"
            title="管理后台"
            aria-label="管理后台"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}

        {/* User info & logout - 用户名手机端隐藏 */}
        <div className="ml-1 flex items-center gap-1 border-l border-border pl-2 md:ml-2 md:gap-2 md:pl-3">
          <span className="hidden text-xs text-text-muted md:inline">{name || role}</span>
          <button
            onClick={handleLogout}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger md:h-8 md:w-auto md:px-2"
            title="退出"
            aria-label="退出"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search - 手机端 order-last + w-full 强制换行到第二行整行；桌面端居中 */}
      <form
        onSubmit={handleSearch}
        className="relative order-last w-full md:order-2 md:mx-4 md:w-auto md:max-w-xl md:flex-1"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            searchScope === 'global' ? '全局搜索...' : '在当前分组搜索...'
          }
          className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-16 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          <button
            type="button"
            onClick={() => setSearchScope(searchScope === 'global' ? 'group' : 'global')}
            className="rounded px-1.5 py-0.5 text-xs text-text-muted transition-colors hover:bg-primary/10 hover:text-primary"
          >
            {searchScope === 'global' ? '全局' : '分组'}
          </button>
        </div>
      </form>
    </header>
  );
}
