'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useGalleryStore } from '@/stores/gallery-store';
import { apiFetch } from '@/lib/utils';
import {
  FolderOpen,
  ChevronRight,
  Search,
  LayoutGrid,
  Shuffle,
  X,
} from 'lucide-react';

interface Group {
  id: string;
  name: string;
  slug: string;
  description?: string;
  randomEnabled: boolean;
  _count: { groupAssets: number; subgroups: number };
  subgroups?: { id: string; name: string; _count: { groupAssets: number } }[];
}

interface GroupSidebarProps {
  className?: string;
  onNavigate?: () => void;
  onClose?: () => void;
}

export function GroupSidebar({ className = '', onNavigate, onClose }: GroupSidebarProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const token = useAuthStore((s) => s.token);
  const { currentGroupId, currentSubgroupId, setGroup } = useGalleryStore();

  useEffect(() => {
    if (!token) return;
    loadGroups();
  }, [token]);

  const loadGroups = async () => {
    const result = await apiFetch<Group[]>('/groups', token!);
    if (result.data) {
      setGroups(result.data);
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  const selectGroup = (groupId: string | null, subgroupId?: string) => {
    setGroup(groupId, subgroupId);
    onNavigate?.();
  };

  return (
    <aside className={`flex w-72 max-w-[86vw] flex-col border-r border-border bg-white md:w-64 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <LayoutGrid className="h-4 w-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">分组</span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-text-muted transition-colors hover:bg-background-secondary hover:text-text-primary md:hidden"
            aria-label="关闭分组栏"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="搜索分组..."
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Group list */}
      <nav className="flex-1 overflow-y-auto px-2 py-1" aria-label="分组导航">
        {/* All images option */}
        <button
          onClick={() => selectGroup(null)}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
            !currentGroupId
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-text-secondary hover:bg-background-secondary'
          }`}
        >
          <FolderOpen className="h-4 w-4" />
          <span>全部图片</span>
        </button>

        {filteredGroups.map((group) => (
          <div key={group.id}>
            {/* Group item */}
            <div className="flex items-center">
              <button
                onClick={() => {
                  selectGroup(group.id);
                  if (group.subgroups && group.subgroups.length > 0) {
                    toggleGroup(group.id);
                  }
                }}
                className={`flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  currentGroupId === group.id && !currentSubgroupId
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-secondary hover:bg-background-secondary'
                }`}
              >
                <FolderOpen className="h-4 w-4 shrink-0" />
                <span className="truncate">{group.name}</span>
                {group.randomEnabled && (
                  <Shuffle className="h-3 w-3 shrink-0 text-primary/60" />
                )}
                <span className="ml-auto text-xs text-text-muted">
                  {group._count.groupAssets}
                </span>
              </button>

              {/* Expand button for subgroups */}
              {group._count.subgroups > 0 && (
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="rounded p-1 text-text-muted hover:bg-background-secondary"
                  aria-label={expandedGroups.has(group.id) ? '收起' : '展开'}
                >
                  <ChevronRight
                    className={`h-3.5 w-3.5 transition-transform ${
                      expandedGroups.has(group.id) ? 'rotate-90' : ''
                    }`}
                  />
                </button>
              )}
            </div>

            {/* Subgroups */}
            {expandedGroups.has(group.id) &&
              group.subgroups &&
              group.subgroups.length > 0 && (
                <div className="ml-4 border-l border-border pl-2">
                  {group.subgroups.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => selectGroup(group.id, sub.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                        currentSubgroupId === sub.id
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-text-muted hover:bg-background-secondary hover:text-text-secondary'
                      }`}
                    >
                      <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{sub.name}</span>
                      <span className="ml-auto text-xs text-text-muted">
                        {sub._count.groupAssets}
                      </span>
                    </button>
                  ))}
                </div>
              )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
