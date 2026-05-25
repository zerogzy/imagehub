'use client';

import { useEffect } from 'react';
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

  useEffect(() => {
    if (!hasHydrated) return;
    if (!token || isSessionExpired() || !isAdmin()) {
      router.replace('/');
    }
  }, [token, hasHydrated, isSessionExpired, isAdmin, router]);

  if (!hasHydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (!token || isSessionExpired() || !isAdmin()) return null;

  return (
    <div className="flex h-screen bg-background">
      <aside className="flex w-60 flex-col border-r border-border bg-white">
        <div className="flex items-center gap-2 border-b border-border px-4 py-4">
          <Image className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold text-text-primary">ImageHub Admin</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="管理员导航">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => router.push(item.href)}
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
            onClick={() => router.push('/gallery')}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-background-secondary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            返回图片广场
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
