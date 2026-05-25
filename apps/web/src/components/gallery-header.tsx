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
    <header className="flex h-14 items-center gap-3 border-b border-border bg-white px-4">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <Image className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold text-text-primary">ImageHub</span>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="relative mx-4 flex-1 max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            searchScope === 'global' ? '全局搜索...' : '在当前分组搜索...'
          }
          className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-24 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          <button
            type="button"
            onClick={() => setSearchScope(searchScope === 'global' ? 'group' : 'global')}
            className="rounded px-1.5 py-0.5 text-xs text-text-muted hover:bg-primary/10 hover:text-primary transition-colors"
          >
            {searchScope === 'global' ? '全局' : '分组'}
          </button>
        </div>
      </form>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Seed status */}
        {currentSeed && (
          <div className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">
            <Shuffle className="h-3 w-3" />
            <span>{currentSeed.slice(0, 8)}</span>
            <button
              onClick={() => setSeed(null)}
              className="ml-1 rounded p-0.5 hover:bg-primary/20"
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
          className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-text-secondary hover:bg-primary/10 hover:text-primary transition-colors"
          title="复制当前视图链接"
        >
          <Link2 className="h-4 w-4" />
        </button>

        {/* Admin actions */}
        {role === 'admin' && (
          <button
            onClick={() => router.push('/admin')}
            className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-text-secondary hover:bg-primary/10 hover:text-primary transition-colors"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}

        {/* User info & logout */}
        <div className="ml-2 flex items-center gap-2 border-l border-border pl-3">
          <span className="text-xs text-text-muted">{name || role}</span>
          <button
            onClick={handleLogout}
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-text-secondary hover:bg-danger/10 hover:text-danger transition-colors"
            title="退出"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
