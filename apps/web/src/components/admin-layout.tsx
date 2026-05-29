'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import {
  Upload,
  Images,
  FolderOpen,
  Tags,
  GitCompareArrows,
  Trash2,
  BarChart3,
  KeyRound,
  Link2,
  Database,
  Settings,
  ArrowLeft,
  Image,
  Menu,
  X,
} from 'lucide-react';

const NAV_ITEMS = [
  { label: '上传中心', icon: Upload, href: '/admin/upload', id: 'upload' },
  { label: '媒体管理', icon: Images, href: '/admin/media', id: 'media' },
  { label: '分组管理', icon: FolderOpen, href: '/admin/groups', id: 'groups' },
  { label: '标签管理', icon: Tags, href: '/admin/tags', id: 'tags' },
  { label: '相似度审核', icon: GitCompareArrows, href: '/admin/similarity', id: 'similarity' },
  { label: '回收站', icon: Trash2, href: '/admin/trash', id: 'trash' },
  { label: '访问统计', icon: BarChart3, href: '/admin/stats', id: 'stats' },
  { label: 'Token 管理', icon: KeyRound, href: '/admin/tokens', id: 'tokens' },
  { label: '永久链接', icon: Link2, href: '/admin/shares', id: 'shares' },
  { label: '备份导出', icon: Database, href: '/admin/backup', id: 'backup' },
  { label: '系统设置', icon: Settings, href: '/admin/settings', id: 'settings' },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const isSessionExpired = useAuthStore((s) => s.isSessionExpired);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!token || isSessionExpired() || !isAdmin()) {
      router.replace('/');
    }
  }, [token, hasHydrated, isSessionExpired, isAdmin, router]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (!hasHydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (!token || isSessionExpired() || !isAdmin()) return null;

  const currentNavItem = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/'),
  );

  const renderNav = (closable: boolean) => (
    <>
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <Image className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold text-text-primary">ImageHub Admin</span>
        {closable && (
          <button
            onClick={() => setMobileNavOpen(false)}
            className="ml-auto rounded-md p-1 text-text-muted transition-colors hover:bg-background-secondary hover:text-text-primary md:hidden"
            aria-label="关闭导航"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="管理员导航">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => {
                router.push(item.href);
                setMobileNavOpen(false);
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-text-secondary hover:bg-background-secondary'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="border-t border-border px-3 py-3">
        <button
          onClick={() => {
            router.push('/gallery');
            setMobileNavOpen(false);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-background-secondary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          返回图片广场
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen flex-col bg-background md:flex-row">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-white px-3 md:hidden">
        <button
          onClick={() => setMobileNavOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-primary/10 hover:text-primary"
          aria-label="打开导航"
        >
          <Menu className="h-4 w-4" />
        </button>
        <Image className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-text-primary">
          {currentNavItem?.label ?? 'ImageHub Admin'}
        </span>
        <button
          onClick={() => router.push('/gallery')}
          className="ml-auto flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-text-secondary transition-colors hover:bg-primary/10 hover:text-primary"
          aria-label="返回图片广场"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回
        </button>
      </header>

      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-white md:flex">
        {renderNav(false)}
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            className="absolute inset-0 cursor-default bg-black/35"
            onClick={() => setMobileNavOpen(false)}
            aria-label="关闭导航遮罩"
          />
          <aside className="relative z-10 flex h-full w-64 max-w-[86vw] flex-col border-r border-border bg-white shadow-xl">
            {renderNav(true)}
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">{children}</main>
    </div>
  );
}
