'use client';

import { X } from 'lucide-react';
import { slugify } from '@/lib/utils';

export interface GroupFormData {
  name: string;
  slug: string;
  description: string;
  randomEnabled: boolean;
  randomRotateInterval: number | null;
}

interface AdminGroupModalProps {
  mode: 'create' | 'edit';
  form: GroupFormData;
  onFormChange: (form: GroupFormData) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function AdminGroupModal({
  mode,
  form,
  onFormChange,
  onClose,
  onSubmit,
}: AdminGroupModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md animate-scale-in rounded-2xl bg-white p-5 shadow-modal sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">
            {mode === 'edit' ? '编辑分组' : '新建分组'}
          </h2>
          <button
            onClick={onClose}
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
              onChange={(e) => onFormChange({ ...form, name: e.target.value, slug: slugify(e.target.value) })}
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
              onChange={(e) => onFormChange({ ...form, slug: e.target.value })}
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
              onChange={(e) => onFormChange({ ...form, description: e.target.value })}
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
                onChange={(e) => onFormChange({ ...form, randomEnabled: e.target.checked })}
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
                onChange={(e) => onFormChange({ ...form, randomRotateInterval: e.target.value ? parseInt(e.target.value) : null })}
                placeholder="60"
                className="h-10 w-full rounded-lg border border-border px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-background-secondary transition-colors"
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            disabled={!form.name.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {mode === 'edit' ? '保存' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
}
