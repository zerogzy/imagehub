'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch, cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import {
  Plus,
  Tag,
  Trash2,
  Edit3,
  X,
  Check,
  Loader2,
  Search,
} from 'lucide-react';

interface TagItem {
  id: string;
  name: string;
  normalizedName: string;
  aliasesJson: string;
  _count: { assetTags: number };
}

export function AdminTagManager() {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTag, setEditingTag] = useState<TagItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formAliases, setFormAliases] = useState('');

  const token = useAuthStore((s) => s.token);

  const fetchTags = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const result = await apiFetch<TagItem[]>('/tags', token);
    if (result.data) setTags(result.data as any);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleCreate = async () => {
    if (!token || !formName.trim()) return;

    const aliases = formAliases
      .split(/[,，]/)
      .map((a) => a.trim())
      .filter(Boolean);

    const result = await apiFetch('/admin/tags', token, {
      method: 'POST',
      body: JSON.stringify({ name: formName.trim(), aliases }),
    });

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '标签创建成功');
    setShowCreateModal(false);
    setFormName('');
    setFormAliases('');
    fetchTags();
  };

  const handleUpdate = async () => {
    if (!token || !editingTag || !formName.trim()) return;

    const aliases = formAliases
      .split(/[,，]/)
      .map((a) => a.trim())
      .filter(Boolean);

    const result = await apiFetch(`/admin/tags/${editingTag.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ name: formName.trim(), aliases }),
    });

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '标签更新成功');
    setEditingTag(null);
    setFormName('');
    setFormAliases('');
    fetchTags();
  };

  const handleDelete = async (tagId: string) => {
    if (!token) return;
    if (!confirm('确定要删除此标签吗？')) return;

    const result = await apiFetch(`/admin/tags/${tagId}`, token, {
      method: 'DELETE',
    });

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '标签已删除');
    fetchTags();
  };

  const openEdit = (tag: TagItem) => {
    setEditingTag(tag);
    setFormName(tag.name);
    try {
      const aliases = JSON.parse(tag.aliasesJson || '[]');
      setFormAliases(Array.isArray(aliases) ? aliases.join(', ') : '');
    } catch {
      setFormAliases('');
    }
  };

  const filteredTags = tags.filter((t) =>
    t.name.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  const getAliases = (tag: TagItem): string[] => {
    try {
      const parsed = JSON.parse(tag.aliasesJson || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
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
          <h1 className="text-xl font-bold text-text-primary">标签管理</h1>
          <p className="mt-1 text-sm text-text-secondary">
            管理公开标签，支持别名设置
          </p>
        </div>
        <button
          onClick={() => { setShowCreateModal(true); setFormName(''); setFormAliases(''); }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" />
          新建标签
        </button>
      </div>

      {/* Search */}
      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="搜索标签..."
          className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Tags grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredTags.map((tag) => {
          const aliases = getAliases(tag);
          return (
            <div
              key={tag.id}
              className="rounded-xl border border-border bg-white p-4 transition-shadow hover:shadow-card-hover"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" />
                  <span className="font-medium text-text-primary">{tag.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(tag)}
                    className="rounded-lg p-1.5 text-text-muted hover:bg-primary/10 hover:text-primary transition-colors"
                    aria-label="编辑标签"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(tag.id)}
                    className="rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger transition-colors"
                    aria-label="删除标签"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {aliases.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {aliases.map((alias, i) => (
                    <span
                      key={i}
                      className="rounded-md bg-background-secondary px-1.5 py-0.5 text-[10px] text-text-secondary"
                    >
                      {alias}
                    </span>
                  ))}
                </div>
              )}

              <p className="mt-2 text-xs text-text-muted">
                {tag._count?.assetTags ?? 0} 个媒体文件
              </p>
            </div>
          );
        })}
      </div>

      {filteredTags.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Tag className="mx-auto mb-3 h-10 w-10 text-text-muted" />
          <p className="text-sm text-text-muted">
            {searchFilter ? '没有匹配的标签' : '暂无标签，点击右上角创建'}
          </p>
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || editingTag) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowCreateModal(false); setEditingTag(null); } }}
        >
          <div className="w-full max-w-md animate-scale-in rounded-2xl bg-white p-6 shadow-modal">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">
                {editingTag ? '编辑标签' : '新建标签'}
              </h2>
              <button
                onClick={() => { setShowCreateModal(false); setEditingTag(null); }}
                className="rounded-lg p-1.5 text-text-muted hover:bg-background-secondary transition-colors"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-primary">
                  标签名称 <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="输入标签名称"
                  className="h-10 w-full rounded-lg border border-border px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-primary">
                  别名
                </label>
                <input
                  type="text"
                  value={formAliases}
                  onChange={(e) => setFormAliases(e.target.value)}
                  placeholder="用逗号分隔多个别名，如：蓝天, sky, 青空"
                  className="h-10 w-full rounded-lg border border-border px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <p className="mt-1 text-xs text-text-muted">
                  搜索时别名也能匹配到此标签
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowCreateModal(false); setEditingTag(null); }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-background-secondary transition-colors"
              >
                取消
              </button>
              <button
                onClick={editingTag ? handleUpdate : handleCreate}
                disabled={!formName.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {editingTag ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
