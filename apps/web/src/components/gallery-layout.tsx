'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { GalleryHeader } from './gallery-header';
import { GroupSidebar } from './group-sidebar';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export function GalleryLayout({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const isSessionExpired = useAuthStore((s) => s.isSessionExpired);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!token || isSessionExpired()) {
      // 未登录时保留目标地址 (含 ?asset=)，登录后跳回，复制链接体验闭环
      const target = window.location.pathname + window.location.search;
      const redirect = target && target !== '/' ? `/?redirect=${encodeURIComponent(target)}` : '/';
      router.replace(redirect);
    }
  }, [token, hasHydrated, isSessionExpired, router]);

  if (!hasHydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (!token || isSessionExpired()) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <GalleryHeader />
      <div className="relative flex flex-1 overflow-hidden">
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="absolute left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-text-secondary shadow-sm transition-colors hover:bg-primary/10 hover:text-primary md:hidden"
          aria-label="打开分组栏"
        >
          <Menu className="h-4 w-4" />
        </button>

        {desktopSidebarOpen && (
          <GroupSidebar className="hidden shrink-0 md:flex" />
        )}

        <button
          onClick={() => setDesktopSidebarOpen((open) => !open)}
          className="hidden h-full w-9 shrink-0 items-start justify-center border-r border-border bg-white pt-3 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary md:flex"
          aria-label={desktopSidebarOpen ? '隐藏分组栏' : '显示分组栏'}
          title={desktopSidebarOpen ? '隐藏分组栏' : '显示分组栏'}
        >
          {desktopSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>

        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
            <button
              className="absolute inset-0 cursor-default bg-black/35"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="关闭分组栏遮罩"
            />
            <GroupSidebar
              className="relative z-10 h-full shadow-xl"
              onClose={() => setMobileSidebarOpen(false)}
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          </div>
        )}

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
