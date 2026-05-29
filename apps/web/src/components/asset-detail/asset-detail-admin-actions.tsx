'use client';

import { useState } from 'react';
import {
  Copy,
  Loader2,
  MoveRight,
  Share2,
  Tag,
  Trash2,
} from 'lucide-react';
import { apiFetch, copyToClipboard } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import type { AssetDetail, GroupItem, TagItem } from './types';

interface AssetDetailAdminActionsProps {
  asset: AssetDetail;
  token: string;
  groups: GroupItem[];
  tags: TagItem[];
  onReload: () => Promise<void> | void;
  onReloadOptions: () => Promise<void> | void;
  onChanged?: () => void;
  onClose: () => void;
}

/**
 * 详情页管理员操作: 永久链接 / 打标签 / 移动至分组 / 删除 / 永久链接清单。
 * 内部维护各表单状态; 写操作完成后调 onReload (重新加载 asset) 与 onChanged (告知外部列表刷新)。
 */
export function AssetDetailAdminActions({
  asset,
  token,
  groups,
  tags,
  onReload,
  onReloadOptions,
  onChanged,
  onClose,
}: AssetDetailAdminActionsProps) {
  const [selectedTagId, setSelectedTagId] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [applyingTag, setApplyingTag] = useState(false);
  const [moveGroupId, setMoveGroupId] = useState('');
  const [moveSubgroupId, setMoveSubgroupId] = useState('');
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const currentGroup = asset.groupAssets[0];
  const activeMoveGroupId = moveGroupId || currentGroup?.group.id || groups[0]?.id || '';

  const handleCreatePermanentShare = async () => {
    const result = await apiFetch<{ shareId: string }>('/admin/shares/permanent', token, {
      method: 'POST',
      body: JSON.stringify({ assetId: asset.id }),
    });
    if (result.data) {
      showToast('success', '永久下载链接已创建');
      await onReload();
    } else {
      showToast('error', '创建永久链接失败');
    }
  };

  const handleApplyTag = async () => {
    if (applyingTag) return;
    const names = tagInput
      .split(/[,，、\s]+/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (!selectedTagId && names.length === 0) return;

    setApplyingTag(true);
    const result = await apiFetch('/admin/assets/batch/tag', token, {
      method: 'POST',
      body: JSON.stringify({
        assetIds: [asset.id],
        ...(selectedTagId ? { tagId: selectedTagId } : { names }),
        source: 'admin',
      }),
    });
    setApplyingTag(false);

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '标签已添加');
    setSelectedTagId('');
    setTagInput('');
    await onReload();
    await onReloadOptions();
    onChanged?.();
  };

  const handleMoveAsset = async () => {
    const targetGroupId = activeMoveGroupId;
    if (!targetGroupId || moving) return;
    setMoving(true);
    const result = await apiFetch('/admin/assets/move-to-group', token, {
      method: 'POST',
      body: JSON.stringify({
        assetIds: [asset.id],
        groupId: targetGroupId,
        subgroupId: moveSubgroupId || undefined,
      }),
    });
    setMoving(false);

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '已移动至分组');
    await onReload();
    onChanged?.();
  };

  const handleDeleteAsset = async () => {
    if (deleting) return;
    if (!window.confirm('确定要将此文件移到回收站吗？')) return;
    setDeleting(true);
    const result = await apiFetch(`/admin/assets/${asset.id}`, token, { method: 'DELETE' });
    setDeleting(false);

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '已移到回收站');
    onChanged?.();
    onClose();
  };

  return (
    <>
      <button
        onClick={handleCreatePermanentShare}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-background-secondary transition-colors"
      >
        <Share2 className="h-4 w-4" />
        生成永久下载链接
      </button>

      <div className="rounded-lg border border-border p-3">
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text-primary">
          <Tag className="h-3.5 w-3.5" />
          打标签
        </h4>
        <div className="space-y-2">
          <input
            value={tagInput}
            onChange={(e) => {
              setTagInput(e.target.value);
              if (e.target.value) setSelectedTagId('');
            }}
            placeholder="输入新标签，多个用空格或逗号分隔"
            disabled={applyingTag}
            className="h-9 w-full rounded-lg border border-border px-3 text-xs text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <select
            value={selectedTagId}
            onChange={(e) => {
              setSelectedTagId(e.target.value);
              if (e.target.value) setTagInput('');
            }}
            disabled={applyingTag}
            className="h-9 w-full rounded-lg border border-border px-3 text-xs text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">选择已有标签</option>
            {tags.map((tagItem) => (
              <option key={tagItem.id} value={tagItem.id}>
                {tagItem.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleApplyTag}
            disabled={applyingTag || (!selectedTagId && !tagInput.trim())}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {applyingTag ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Tag className="h-3.5 w-3.5" />
            )}
            添加标签
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text-primary">
          <MoveRight className="h-3.5 w-3.5" />
          移动至分组
        </h4>
        <div className="space-y-2">
          <select
            value={activeMoveGroupId}
            onChange={(e) => {
              setMoveGroupId(e.target.value);
              setMoveSubgroupId('');
            }}
            disabled={moving}
            className="h-9 w-full rounded-lg border border-border px-3 text-xs text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">请选择分组</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <select
            value={moveSubgroupId || currentGroup?.subgroup?.id || ''}
            onChange={(e) => setMoveSubgroupId(e.target.value)}
            disabled={moving || !activeMoveGroupId}
            className="h-9 w-full rounded-lg border border-border px-3 text-xs text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">不指定子分组</option>
            {groups
              .find((group) => group.id === activeMoveGroupId)
              ?.subgroups?.map((subgroup) => (
                <option key={subgroup.id} value={subgroup.id}>
                  {subgroup.name}
                </option>
              ))}
          </select>
          <button
            onClick={handleMoveAsset}
            disabled={moving || !activeMoveGroupId}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-background-secondary disabled:opacity-50"
          >
            {moving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MoveRight className="h-3.5 w-3.5" />
            )}
            移动
          </button>
        </div>
      </div>

      <button
        onClick={handleDeleteAsset}
        disabled={deleting}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-danger/30 px-4 py-2.5 text-sm font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
      >
        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        删除图片
      </button>

      {asset.downloadShares && asset.downloadShares.length > 0 && (
        <div className="mt-4 rounded-lg bg-background-secondary p-3">
          <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
            <Share2 className="h-3.5 w-3.5" />
            永久下载链接
          </h4>
          <div className="mt-2 space-y-2">
            {asset.downloadShares.map((share) => (
              <div key={share.id} className="flex items-center gap-2 text-xs text-text-muted">
                <code className="flex-1 truncate rounded bg-white px-1.5 py-0.5 text-[11px]">
                  /share/download/{share.shareId}
                </code>
                <span className="shrink-0">下载 {share.downloadCount} 次</span>
                <button
                  onClick={async () => {
                    const url = `${window.location.origin}/api/v1/share/download/${share.shareId}`;
                    const ok = await copyToClipboard(url);
                    if (ok) showToast('success', '永久链接已复制');
                  }}
                  className="shrink-0 rounded p-0.5 text-primary hover:bg-primary/10 transition-colors"
                  aria-label="复制永久链接"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
