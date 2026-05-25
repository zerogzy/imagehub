'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch, slugify, cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import {
  Plus,
  FolderOpen,
  Trash2,
  Edit3,
  Shuffle,
  ChevronRight,
  X,
  Check,
  GripVertical,
  Loader2,
  FolderPlus,
} from 'lucide-react';

interface Subgroup {
  id: string;
  name: string;
  description?: string;
  rankKey: string;
  _count?: { groupAssets: number };
}

interface Group {
  id: string;
  name: string;
  slug: string;
  description?: string;
  rankKey: string;
  randomEnabled: boolean;
  randomRotateInterval?: number | null;
  currentSeed?: string | null;
  _count: { groupAssets: number; subgroups: number };
  subgroups?: Subgroup[];
}

interface GroupFormData {
  name: string;
  slug: string;
  description: string;
  randomEnabled: boolean;
  randomRotateInterval: number | null;
}

const emptyForm: GroupFormData = {
  name: '',
  slug: '',
  description: '',
  randomEnabled: false,
  randomRotateInterval: null,
};

export function AdminGroupManager() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [form, setForm] = useState<GroupFormData>(emptyForm);
  const [creatingSubgroupFor, setCreatingSubgroupFor] = useState<string | null>(null);
  const [subgroupName, setSubgroupName] = useState('');

  const token = useAuthStore((s) => s.token);

  const fetchGroups = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const result = await apiFetch<Group[]>('/groups', token);
    if (result.data) {
      // Load subgroups for each group
      const groupsWithSubs = await Promise.all(
        (result.data as any[]).map(async (g) => {
          const subResult = await apiFetch<Subgroup[]>(`/groups/${g.id}/subgroups`, token!);
          return { ...g, subgroups: subResult.data || [] };
        }),
      );
      setGroups(groupsWithSubs);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleCreateGroup = async () => {
    if (!token || !form.name.trim()) return;

    const result = await apiFetch('/admin/groups', token, {
      method: 'POST',
      body: JSON.stringify({
        name: form.name.trim(),
        slug: form.slug || slugify(form.name),
        description: form.description || undefined,
        randomEnabled: form.randomEnabled,
        randomRotateInterval: form.randomRotateInterval || undefined,
      }),
    });

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '分组创建成功');
    setShowCreateModal(false);
    setForm(emptyForm);
    fetchGroups();
  };

  const handleUpdateGroup = async () => {
    if (!token || !editingGroup) return;

    const result = await apiFetch(`/admin/groups/${editingGroup.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        name: form.name.trim(),
        slug: form.slug || slugify(form.name),
        description: form.description || undefined,
        randomEnabled: form.randomEnabled,
        randomRotateInterval: form.randomRotateInterval || undefined,
      }),
    });

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '分组更新成功');
    setEditingGroup(null);
    setForm(emptyForm);
    fetchGroups();
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!token) return;
    if (!confirm('确定要删除此分组吗？分组内的图片不会被删除。')) return;

    const result = await apiFetch(`/admin/groups/${groupId}`, token, {
      method: 'DELETE',
    });

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '分组已删除');
    fetchGroups();
  };

  const handleCreateSubgroup = async (groupId: string) => {
    if (!token || !subgroupName.trim()) return;

    const result = await apiFetch('/admin/subgroups', token, {
      method: 'POST',
      body: JSON.stringify({
        groupId,
        name: subgroupName.trim(),
      }),
    });

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '二级分组创建成功');
    setCreatingSubgroupFor(null);
    setSubgroupName('');
    fetchGroups();
  };

  const handleDeleteSubgroup = async (subgroupId: string) => {
    if (!token) return;
    if (!confirm('确定要删除此二级分组吗？')) return;

    const result = await apiFetch(`/admin/subgroups/${subgroupId}`, token, {
      method: 'DELETE',
    });

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '二级分组已删除');
    fetchGroups();
  };

  const toggleExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const openEditModal = (group: Group) => {
    setEditingGroup(group);
    setForm({
      name: group.name,
      slug: group.slug,
      description: group.description || '',
      randomEnabled: group.randomEnabled,
      randomRotateInterval: group.randomRotateInterval ?? null,
    });
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">分组管理</h1>
          <p className="mt-1 text-sm text-text-secondary">
            管理图片分组和二级分组，支持随机轮换设置
          </p>
        </div>
        <button
          onClick={() => { setShowCreateModal(true); setForm(emptyForm); }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" />
          新建分组
        </button>
      </div>

      {/* Group list */}
      <div className="space-y-2">
        {groups.map((group) => (
          <div key={group.id} className="rounded-xl border border-border bg-white">
            {/* Group header */}
            <div className="flex items-center gap-3 p-4">
              <button
                onClick={() => toggleExpand(group.id)}
                className="rounded p-0.5 text-text-muted hover:bg-background-secondary transition-colors"
                aria-label={expandedGroups.has(group.id) ? '收起' : '展开'}
              >
                <ChevronRight
                  className={cn(
                    'h-4 w-4 transition-transform',
                    expandedGroups.has(group.id) ? 'rotate-90' : '',
                  )}
                />
              </button>

              <FolderOpen className="h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{group.name}</span>
                  {group.randomEnabled && (
                    <span className="flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      <Shuffle className="h-2.5 w-2.5" />
                      随机
                      {group.randomRotateInterval && ` ${group.randomRotateInterval}分钟`}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted">
                  {group._count.groupAssets} 张图片
                  {group._count.subgroups > 0 && ` · ${group._count.subgroups} 个二级分组`}
                  {group.slug && ` · ${group.slug}`}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCreatingSubgroupFor(group.id)}
                  className="rounded-lg p-2 text-text-muted hover:bg-primary/10 hover:text-primary transition-colors"
                  title="添加二级分组"
                  aria-label="添加二级分组"
                >
                  <FolderPlus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => openEditModal(group)}
                  className="rounded-lg p-2 text-text-muted hover:bg-primary/10 hover:text-primary transition-colors"
                  title="编辑"
                  aria-label="编辑分组"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeleteGroup(group.id)}
                  className="rounded-lg p-2 text-text-muted hover:bg-danger/10 hover:text-danger transition-colors"
                  title="删除"
                  aria-label="删除分组"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Subgroups */}
            {expandedGroups.has(group.id) && group.subgroups && group.subgroups.length > 0 && (
              <div className="border-t border-border px-4 py-2">
                {group.subgroups.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-background-secondary transition-colors"
                  >
                    <FolderOpen className="h-4 w-4 text-text-muted" />
                    <span className="flex-1 text-sm text-text-primary">{sub.name}</span>
                    <span className="text-xs text-text-muted">
                      {sub._count?.groupAssets ?? 0} 张
                    </span>
                    <button
                      onClick={() => handleDeleteSubgroup(sub.id)}
                      className="rounded p-1 text-text-muted hover:text-danger transition-colors"
                      aria-label="删除二级分组"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Create subgroup inline */}
            {creatingSubgroupFor === group.id && (
              <div className="border-t border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={subgroupName}
                    onChange={(e) => setSubgroupName(e.target.value)}
                    placeholder="二级分组名称"
                    className="h-8 flex-1 rounded-md border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateSubgroup(group.id);
                      if (e.key === 'Escape') { setCreatingSubgroupFor(null); setSubgroupName(''); }
                    }}
                  />
                  <button
                    onClick={() => handleCreateSubgroup(group.id)}
                    className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover transition-colors"
                  >
                    <Check className="h-3 w-3" />
                    创建
                  </button>
                  <button
                    onClick={() => { setCreatingSubgroupFor(null); setSubgroupName(''); }}
                    className="rounded-md px-2 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {groups.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <FolderOpen className="mx-auto mb-3 h-10 w-10 text-text-muted" />
            <p className="text-sm text-text-muted">暂无分组，点击右上角创建</p>
          </div>
        )}
      </div>

      {/* Create/Edit Group Modal */}
      {(showCreateModal || editingGroup) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowCreateModal(false); setEditingGroup(null); } }}
        >
          <div className="w-full max-w-md animate-scale-in rounded-2xl bg-white p-6 shadow-modal">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">
                {editingGroup ? '编辑分组' : '新建分组'}
              </h2>
              <button
                onClick={() => { setShowCreateModal(false); setEditingGroup(null); }}
                className="rounded-lg p-1.5 text-text-muted hover:bg-background-secondary transition-colors"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-primary">
                  分组名称 <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => {
                    setForm({ ...form, name: e.target.value, slug: slugify(e.target.value) });
                  }}
                  placeholder="输入分组名称"
                  className="h-10 w-full rounded-lg border border-border px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-primary">
                  Slug
                </label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="url-friendly-name"
                  className="h-10 w-full rounded-lg border border-border px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-primary">
                  描述
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="可选描述"
                  rows={2}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="flex items-center gap-3">
                <label className="relative flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.randomEnabled}
                    onChange={(e) => setForm({ ...form, randomEnabled: e.target.checked })}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-text-primary">启用随机轮换</span>
                </label>
              </div>

              {form.randomEnabled && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-primary">
                    轮换间隔（分钟）
                  </label>
                  <input
                    type="number"
                    value={form.randomRotateInterval ?? ''}
                    onChange={(e) => setForm({ ...form, randomRotateInterval: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="60"
                    className="h-10 w-full rounded-lg border border-border px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowCreateModal(false); setEditingGroup(null); }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-background-secondary transition-colors"
              >
                取消
              </button>
              <button
                onClick={editingGroup ? handleUpdateGroup : handleCreateGroup}
                disabled={!form.name.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {editingGroup ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
