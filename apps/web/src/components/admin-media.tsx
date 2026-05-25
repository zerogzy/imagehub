'use client';

import { useEffect, useState, useCallback, useMemo, useRef, type KeyboardEvent, type DragEvent } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch, formatFileSize, cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { AssetDetailModal } from './asset-detail-modal';
import {
  Search,
  Trash2,
  Tag,
  FolderOpen,
  CheckSquare,
  Square,
  ImageOff,
  Loader2,
  X,
  MoreHorizontal,
  MoveRight,
  Eye,
  Download,
} from 'lucide-react';

interface AdminAsset {
  id: string;
  originalFilename: string;
  displayFilename: string | null;
  mediaType: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: string;
  status: string;
  viewCount: number;
  downloadCount: number;
  thumbStorageKey: string | null;
  groups: { groupId: string; groupName: string; subgroupId?: string | null; subgroupName?: string | null; rankKey?: string }[];
  tags: { id: string; name: string }[];
  createdAt: string;
}

interface GroupItem {
  id: string;
  name: string;
  randomEnabled?: boolean;
  subgroups?: { id: string; name: string }[];
  _count?: { groupAssets: number };
}

interface TagItem {
  id: string;
  name: string;
}

interface ContextMenuState {
  asset: AdminAsset;
  x: number;
  y: number;
}

interface DragState {
  assetId: string;
  subgroupId: string | null;
  originOrder: string[];
}

type DropPlacement = 'before' | 'after';

const ROOT_SUBGROUP_VALUE = '__root__';

export function AdminMediaManager() {
  const [assets, setAssets] = useState<AdminAsset[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string>('');
  const [groupFilter, setGroupFilter] = useState<string>('');
  const [subgroupFilter, setSubgroupFilter] = useState<string>('');
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [taggingAsset, setTaggingAsset] = useState<AdminAsset | null>(null);
  const [selectedTagId, setSelectedTagId] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [applyingTag, setApplyingTag] = useState(false);
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);
  const [movingAsset, setMovingAsset] = useState<AdminAsset | null>(null);
  const [moveGroupId, setMoveGroupId] = useState('');
  const [moveSubgroupId, setMoveSubgroupId] = useState('');
  const [moving, setMoving] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragTarget, setDragTarget] = useState<{ assetId: string; placement: DropPlacement } | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const assetsRef = useRef<AdminAsset[]>([]);
  const suppressClickRef = useRef(false);

  const token = useAuthStore((s) => s.token);
  const currentGroup = groups.find((group) => group.id === groupFilter);
  const isSearchMode = !!searchQuery.trim();
  const groupHasSubgroups = !!currentGroup?.subgroups?.length;
  const canSortBase = !!groupFilter && !!currentGroup && !isSearchMode && !currentGroup.randomEnabled;

  const fetchGroupsAndTags = useCallback(async () => {
    if (!token) return;
    const [groupsResult, tagsResult] = await Promise.all([
      apiFetch<GroupItem[]>('/groups', token),
      apiFetch<TagItem[]>('/tags', token),
    ]);
    if (groupsResult.data) setGroups(groupsResult.data);
    if (tagsResult.data) setTags(tagsResult.data);
  }, [token]);

  const fetchAssets = useCallback(async () => {
    if (!token) return;
    setLoading(true);

    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('pageSize', '40');
    if (mediaTypeFilter) params.set('mediaType', mediaTypeFilter);
    if (groupFilter) params.set('groupId', groupFilter);
    if (subgroupFilter) {
      params.set('subgroupId', subgroupFilter === ROOT_SUBGROUP_VALUE ? 'null' : subgroupFilter);
    }
    if (searchQuery.trim()) params.set('search', searchQuery.trim());

    const result = await apiFetch<{ assets: AdminAsset[]; meta: { total: number; totalPages: number } }>(
      `/admin/assets?${params.toString()}`,
      token,
    );

    if (result.data) {
      setAssets(result.data.assets || []);
      setTotal(result.data.meta.total);
      setTotalPages(result.data.meta.totalPages);
    } else if (result.error) {
      showToast('error', result.error);
    }
    setLoading(false);
  }, [token, page, mediaTypeFilter, groupFilter, subgroupFilter, searchQuery]);

  useEffect(() => {
    fetchGroupsAndTags();
  }, [fetchGroupsAndTags]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, []);

  const groupedAssets = useMemo(() => {
    const sections = new Map<string, { name: string; assets: AdminAsset[] }>();
    for (const asset of assets) {
      const group = groupFilter
        ? asset.groups.find((g) => g.groupId === groupFilter)
        : asset.groups[0];
      const key = groupFilter
        ? `${group?.groupId || 'ungrouped'}:${group?.subgroupId || 'root'}`
        : group?.groupId || 'ungrouped';
      const name = groupFilter
        ? group?.subgroupName || '未指定二级分组'
        : group?.groupName || '未分组';
      const section = sections.get(key) || { name, assets: [] };
      section.assets.push(asset);
      sections.set(key, section);
    }
    return Array.from(sections.entries()).map(([id, section]) => ({ id, ...section }));
  }, [assets, groupFilter]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === assets.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(assets.map((a) => a.id)));
    }
  };

  const resetAndSetGroup = (groupId: string) => {
    setGroupFilter(groupId);
    setSubgroupFilter('');
    setSelected(new Set());
    setPage(1);
  };

  const handleBulkDelete = async () => {
    if (!token || selected.size === 0) return;
    if (!confirm(`确定要将 ${selected.size} 个文件移到回收站吗？`)) return;

    const result = await apiFetch('/admin/assets/batch/delete', token, {
      method: 'POST',
      body: JSON.stringify({ assetIds: Array.from(selected) }),
    });

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', `已将 ${selected.size} 个文件移到回收站`);
    setSelected(new Set());
    fetchAssets();
  };

  const handleDelete = async (assetId: string) => {
    if (!token) return;
    if (!confirm('确定要将此文件移到回收站吗？')) return;

    const result = await apiFetch(`/admin/assets/${assetId}`, token, {
      method: 'DELETE',
    });

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '已移到回收站');
    setContextMenu(null);
    fetchAssets();
  };

  const openMoveModal = (asset: AdminAsset) => {
    const currentGroup = asset.groups[0];
    setContextMenu(null);
    setMovingAsset(asset);
    setMoveGroupId(currentGroup?.groupId || groups[0]?.id || '');
    setMoveSubgroupId(currentGroup?.subgroupId || '');
  };

  const handleMoveAsset = async () => {
    if (!token || !movingAsset || !moveGroupId) return;
    setMoving(true);
    const result = await apiFetch('/admin/assets/move-to-group', token, {
      method: 'POST',
      body: JSON.stringify({
        assetIds: [movingAsset.id],
        groupId: moveGroupId,
        subgroupId: moveSubgroupId || undefined,
      }),
    });
    setMoving(false);

    if (result.error) {
      showToast('error', result.error);
      return;
    }

    showToast('success', '已移动至分组');
    setMovingAsset(null);
    fetchAssets();
    fetchGroupsAndTags();
  };
  const getAssetGroupLink = (asset: AdminAsset) => (
    groupFilter
      ? asset.groups.find((group) => group.groupId === groupFilter)
      : asset.groups[0]
  );

  const getAssetSubgroupId = (asset: AdminAsset) => getAssetGroupLink(asset)?.subgroupId || null;

  const canSortAsset = (asset: AdminAsset) => (
    canSortBase && (!groupHasSubgroups || !!subgroupFilter || !!getAssetGroupLink(asset))
  );

  const handleDragStart = (asset: AdminAsset, sectionAssets: AdminAsset[], event: DragEvent<HTMLDivElement>) => {
    if (!canSortAsset(asset)) {
      event.preventDefault();
      return;
    }
    const originOrder = sectionAssets.map((sectionAsset) => sectionAsset.id);
    if (!originOrder.includes(asset.id)) return;

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.dropEffect = 'move';
    event.dataTransfer.setData('text/plain', asset.id);
    suppressClickRef.current = true;
    const nextState = { assetId: asset.id, subgroupId: getAssetSubgroupId(asset), originOrder };
    dragStateRef.current = nextState;
    setDragState(nextState);
    setDragTarget(null);
  };

  const getDropPlacement = (targetAssetId: string): DropPlacement | null => {
    const ds = dragStateRef.current;
    if (!ds || ds.assetId === targetAssetId) return null;

    const sourceIndex = ds.originOrder.indexOf(ds.assetId);
    const targetIndex = ds.originOrder.indexOf(targetAssetId);
    if (sourceIndex < 0 || targetIndex < 0) return null;

    return sourceIndex < targetIndex ? 'after' : 'before';
  };

  const canDropOnAsset = (targetAssetId: string) => {
    const ds = dragStateRef.current;
    if (!ds) return false;
    const targetAsset = assetsRef.current.find((asset) => asset.id === targetAssetId);
    return !!targetAsset && getAssetSubgroupId(targetAsset) === ds.subgroupId;
  };

  const updateDragTarget = (targetAssetId: string) => {
    if (!canDropOnAsset(targetAssetId)) {
      setDragTarget(null);
      return;
    }
    const placement = getDropPlacement(targetAssetId);
    if (!placement) {
      setDragTarget(null);
      return;
    }
    setDragTarget((prev) => (
      prev?.assetId === targetAssetId && prev.placement === placement
        ? prev
        : { assetId: targetAssetId, placement }
    ));
  };

  const acceptAssetDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!canSortBase || !dragStateRef.current) return false;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    return true;
  };

  const handleDragEnterAsset = (targetAssetId: string, event: DragEvent<HTMLDivElement>) => {
    if (!acceptAssetDrop(event)) return;
    updateDragTarget(targetAssetId);
  };

  const handleDragOverAsset = (targetAssetId: string, event: DragEvent<HTMLDivElement>) => {
    if (!acceptAssetDrop(event)) return;
    updateDragTarget(targetAssetId);
  };

  const moveAssetByDrop = (
    list: AdminAsset[],
    assetId: string,
    targetAssetId: string,
    placement: DropPlacement,
  ) => {
    const fromIndex = list.findIndex((asset) => asset.id === assetId);
    const targetIndex = list.findIndex((asset) => asset.id === targetAssetId);
    if (fromIndex < 0 || targetIndex < 0 || assetId === targetAssetId) return list;

    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    const nextTargetIndex = next.findIndex((asset) => asset.id === targetAssetId);
    if (nextTargetIndex < 0) return list;

    next.splice(placement === 'before' ? nextTargetIndex : nextTargetIndex + 1, 0, moved);
    return next;
  };

  const sameOrder = (a: AdminAsset[], b: AdminAsset[]) => (
    a.length === b.length && a.every((asset, index) => asset.id === b[index]?.id)
  );

  const clearDragState = () => {
    dragStateRef.current = null;
    setDragState(null);
    setDragTarget(null);
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  };

  const debugJson = (value: unknown) => {
    const text = JSON.stringify(value);
    return text.length > 700 ? `${text.slice(0, 700)}...` : text;
  };

  const handleDropAsset = async (targetAssetId: string, event: DragEvent<HTMLDivElement>) => {
    if (!acceptAssetDrop(event)) return;

    const ds = dragStateRef.current;
    const placement = getDropPlacement(targetAssetId);
    if (!ds || !placement || !canDropOnAsset(targetAssetId) || !token || !groupFilter) {
      clearDragState();
      return;
    }

    const previousAssets = assetsRef.current;
    const nextAssets = moveAssetByDrop(previousAssets, ds.assetId, targetAssetId, placement);
    if (sameOrder(previousAssets, nextAssets)) {
      clearDragState();
      return;
    }

    setAssets(nextAssets);
    assetsRef.current = nextAssets;

    const scopedAssets = nextAssets.filter((asset) => getAssetSubgroupId(asset) === ds.subgroupId);
    const movedIndex = scopedAssets.findIndex((asset) => asset.id === ds.assetId);
    const beforeAssetId = scopedAssets[movedIndex + 1]?.id || null;
    const afterAssetId = scopedAssets[movedIndex - 1]?.id || null;
    const payloadSubgroupId = ds.subgroupId;

    const requestBody = {
      assetId: ds.assetId,
      subgroupId: payloadSubgroupId,
      beforeAssetId,
      afterAssetId,
    };

    showToast('info', `[拖拽请求] ${debugJson(requestBody)}`, 12000);
    clearDragState();

    const result = await apiFetch('/admin/groups/' + groupFilter + '/assets/reorder', token, {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    if (result.error) {
      setAssets(previousAssets);
      assetsRef.current = previousAssets;
      showToast('error', `[拖拽返回] ${debugJson({ error: result.error })}`, 12000);
      return;
    }

    showToast('success', `[拖拽返回] ${debugJson(result.data || { ok: true })}`, 12000);
    fetchAssets();
  };

  const handleDragEnd = () => {
    clearDragState();
  };

  const getAssetIdFromPoint = (event: DragEvent<HTMLDivElement>) => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const card = target?.closest('[data-asset-id]') as HTMLElement | null;
    return card?.dataset.assetId || null;
  };

  const handleGridDragEvent = (event: DragEvent<HTMLDivElement>) => {
    if (!acceptAssetDrop(event)) return;
    const assetId = getAssetIdFromPoint(event);
    if (assetId) updateDragTarget(assetId);
  };

  const handleGridDrop = async (event: DragEvent<HTMLDivElement>) => {
    if (!acceptAssetDrop(event)) return;
    const assetId = getAssetIdFromPoint(event);
    if (assetId) {
      await handleDropAsset(assetId, event);
      return;
    }
    clearDragState();
  };



  const openTagModal = (asset: AdminAsset) => {
    setContextMenu(null);
    setTaggingAsset(asset);
    setSelectedTagId('');
    setTagInput('');
  };

  const locateAssetGroup = (asset: AdminAsset) => {
    const targetGroup = asset.groups[0];
    if (!targetGroup) {
      showToast('error', '该图片未加入分组');
      return;
    }
    const hasTargetSubgroups = !!groups.find((group) => group.id === targetGroup.groupId)?.subgroups?.length;
    setContextMenu(null);
    setSearchQuery('');
    setGroupFilter(targetGroup.groupId);
    setSubgroupFilter(targetGroup.subgroupId || (hasTargetSubgroups ? ROOT_SUBGROUP_VALUE : ''));
    setSelected(new Set());
    setPage(1);
  };

  const removeTag = async (asset: AdminAsset, tagId: string) => {
    if (!token) return;
    const result = await apiFetch('/admin/assets/batch/untag', token, {
      method: 'POST',
      body: JSON.stringify({ assetIds: [asset.id], tagId }),
    });
    if (result.error) {
      showToast('error', result.error);
      return;
    }
    showToast('success', '标签已删除');
    setTaggingAsset((prev) => prev ? { ...prev, tags: prev.tags.filter((tag) => tag.id !== tagId) } : prev);
    fetchAssets();
    fetchGroupsAndTags();
  };

  const applyTagIds = async (tagIds: string[]) => {
    if (!token || !taggingAsset || tagIds.length === 0) return;
    setApplyingTag(true);
    for (const tagId of tagIds) {
      const result = await apiFetch('/admin/assets/batch/tag', token, {
        method: 'POST',
        body: JSON.stringify({
          assetIds: [taggingAsset.id],
          tagId,
          source: 'admin',
        }),
      });

      if (result.error) {
        showToast('error', result.error);
        setApplyingTag(false);
        return;
      }
    }

    setTaggingAsset((prev) => prev
      ? {
          ...prev,
          tags: [
            ...prev.tags,
            ...tagIds
              .map((id) => tags.find((tagItem) => tagItem.id === id))
              .filter((tagItem): tagItem is TagItem => !!tagItem && !prev.tags.some((tag) => tag.id === tagItem.id)),
          ],
        }
      : prev);
    showToast('success', tagIds.length > 1 ? `已添加 ${tagIds.length} 个标签` : '标签已添加');
    setSelectedTagId('');
    await fetchAssets();
    await fetchGroupsAndTags();
    setApplyingTag(false);
  };

  const applyTagNames = async (rawNames: string[]) => {
    if (!token || !taggingAsset) return;
    const names = Array.from(new Set(rawNames.map((name) => name.trim()).filter(Boolean)));
    if (names.length === 0) return;

    setApplyingTag(true);
    const result = await apiFetch<TagItem[]>('/admin/assets/batch/tag', token, {
      method: 'POST',
      body: JSON.stringify({
        assetIds: [taggingAsset.id],
        names,
        source: 'admin',
      }),
    });

    if (result.error) {
      showToast('error', result.error);
      setApplyingTag(false);
      return;
    }

    const createdTags = result.data || [];
    if (createdTags.length > 0) {
      setTaggingAsset((prev) => prev
        ? {
            ...prev,
            tags: [
              ...prev.tags,
              ...createdTags.filter((tagItem) => !prev.tags.some((tag) => tag.id === tagItem.id)),
            ],
          }
        : prev);
    }
    showToast('success', names.length > 1 ? `已添加 ${names.length} 个标签` : '标签已添加');
    setTagInput('');
    await fetchAssets();
    await fetchGroupsAndTags();
    setApplyingTag(false);
  };

  const handleTagInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    applyTagNames(tagInput.split(/[,，、\s]+/));
  };

  useEffect(() => {
    setShowBulkActions(selected.size > 0);
  }, [selected]);

  const detailIndex = detailAssetId ? assets.findIndex((asset) => asset.id === detailAssetId) : -1;
  const handleDetailPrev = detailIndex > 0 ? () => setDetailAssetId(assets[detailIndex - 1].id) : undefined;
  const handleDetailNext = detailIndex >= 0 && detailIndex < assets.length - 1
    ? () => setDetailAssetId(assets[detailIndex + 1].id)
    : undefined;

  const renderAssetCard = (asset: AdminAsset, sectionAssets: AdminAsset[]) => {
    const assetCanSort = canSortAsset(asset);

    return (
    <div
      key={asset.id}
      data-asset-id={asset.id}
      draggable={assetCanSort}
      onDragStart={(event) => handleDragStart(asset, sectionAssets, event)}
      onDragEnter={(event) => handleDragEnterAsset(asset.id, event)}
      onDragOver={(event) => handleDragOverAsset(asset.id, event)}
      onDrop={(event) => { void handleDropAsset(asset.id, event); }}
      onDragEnd={handleDragEnd}
      onClick={() => {
        if (suppressClickRef.current) return;
        setDetailAssetId(asset.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ asset, x: e.clientX, y: e.clientY });
      }}
      className={cn(
        'group relative overflow-hidden rounded-lg border bg-white transition-shadow hover:shadow-card-hover',
        assetCanSort ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        (dragState?.assetId === asset.id || dragStateRef.current?.assetId === asset.id) && 'opacity-50',
        selected.has(asset.id) ? 'border-primary ring-2 ring-primary/30' : 'border-border',
      )}
    >
      {dragTarget?.assetId === asset.id && dragTarget.placement === 'before' && (
        <div className="pointer-events-none absolute inset-x-1 top-0 z-20 h-1 rounded-full bg-primary" />
      )}
      {dragTarget?.assetId === asset.id && dragTarget.placement === 'after' && (
        <div className="pointer-events-none absolute inset-x-1 bottom-0 z-20 h-1 rounded-full bg-primary" />
      )}

      <button
        draggable={false}
        onClick={(e) => { e.stopPropagation(); toggleSelect(asset.id); }}
        className="absolute left-2 top-2 z-10 rounded bg-white/85 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label={selected.has(asset.id) ? '取消选择' : '选择'}
      >
        {selected.has(asset.id) ? (
          <CheckSquare className="h-4 w-4 text-primary" />
        ) : (
          <Square className="h-4 w-4 text-text-muted" />
        )}
      </button>

      <button
        draggable={false}
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setContextMenu({ asset, x: rect.right - 180, y: rect.bottom + 6 });
        }}
        className="absolute right-2 top-2 z-10 rounded bg-white/85 p-1 opacity-0 transition-opacity hover:bg-white group-hover:opacity-100"
        aria-label="更多操作"
      >
        <MoreHorizontal className="h-4 w-4 text-text-secondary" />
      </button>

      <div className="relative aspect-square bg-background-secondary">
        {asset.thumbStorageKey ? (
          <img
            src={`/api/v1/storage/derivatives/${asset.thumbStorageKey.replace('preview/', '')}`}
            alt={asset.originalFilename}
            className="h-full w-full object-cover"
            loading="lazy"
            draggable={assetCanSort}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageOff className="h-8 w-8 text-text-muted" />
          </div>
        )}

        {asset.mediaType !== 'image' && (
          <span className="absolute right-2 bottom-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {asset.mediaType.toUpperCase()}
          </span>
        )}
      </div>

      <div className="p-2">
        <p className="truncate text-xs font-medium text-text-primary" title={asset.originalFilename}>
          {asset.displayFilename || asset.originalFilename}
        </p>
        <p className="text-[10px] text-text-muted">
          {formatFileSize(asset.sizeBytes)}
          {asset.width && asset.height && ` · ${asset.width}x${asset.height}`}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-text-muted">
          <span className="inline-flex items-center gap-0.5"><Eye className="h-3 w-3" />{asset.viewCount || 0}</span>
          <span className="inline-flex items-center gap-0.5"><Download className="h-3 w-3" />{asset.downloadCount || 0}</span>
        </div>
        <div className="mt-1 flex min-h-5 flex-wrap gap-1">
          {asset.groups.slice(0, 2).map((group) => (
            <span key={group.groupId} className="rounded bg-primary-light px-1.5 py-0.5 text-[10px] text-primary">
              {group.groupName}
            </span>
          ))}
          {asset.tags.slice(0, 2).map((tagItem) => (
            <span key={tagItem.id} className="rounded bg-background-secondary px-1.5 py-0.5 text-[10px] text-text-secondary">
              #{tagItem.name}
            </span>
          ))}
        </div>
      </div>
    </div>
    );
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">媒体管理</h1>
          <p className="mt-1 text-sm text-text-secondary">共 {total} 个媒体文件</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="搜索文件名..."
            className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <select
          value={groupFilter}
          onChange={(e) => resetAndSetGroup(e.target.value)}
          className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          aria-label="按分组筛选"
        >
          <option value="">全部分组</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}{typeof group._count?.groupAssets === 'number' ? ` (${group._count.groupAssets})` : ''}
            </option>
          ))}
        </select>

        {groupFilter && currentGroup?.subgroups && currentGroup.subgroups.length > 0 && (
          <select
            value={subgroupFilter}
            onChange={(e) => { setSubgroupFilter(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            aria-label="按二级分组筛选"
          >
            <option value="">全部二级分组</option>
            <option value={ROOT_SUBGROUP_VALUE}>未指定二级分组</option>
            {currentGroup.subgroups.map((subgroup) => (
              <option key={subgroup.id} value={subgroup.id}>{subgroup.name}</option>
            ))}
          </select>
        )}

        <select
          value={mediaTypeFilter}
          onChange={(e) => { setMediaTypeFilter(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">全部类型</option>
          <option value="image">图片</option>
          <option value="gif">GIF</option>
          <option value="video">视频</option>
          <option value="audio">音频</option>
        </select>

        {showBulkActions && (
          <div className="flex items-center gap-2 rounded-lg bg-primary-light px-3 py-1.5">
            <span className="text-sm font-medium text-primary">已选 {selected.size} 项</span>
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1 rounded-md bg-danger px-2.5 py-1 text-xs font-medium text-white hover:bg-danger-dark transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            删除
          </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              取消选择
            </button>
          </div>
        )}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={selectAll}
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary transition-colors"
        >
          {selected.size === assets.length && assets.length > 0 ? (
            <CheckSquare className="h-4 w-4 text-primary" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          全选当前页
        </button>
        {groupFilter && (
          <span className="text-xs text-text-muted">
            {currentGroup?.randomEnabled
              ? '当前分组已开启随机轮换，禁止拖动排序'
              : isSearchMode
                ? '搜索结果不能排序，请先定位到原分组位置'
                : groupHasSubgroups && !subgroupFilter
                  ? '可在每个二级分组区域内拖动排序'
                  : '可拖动图片调整当前分组顺序'}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <ImageOff className="mb-4 h-12 w-12" />
          <p className="text-sm">暂无媒体文件</p>
        </div>
      ) : (
        <div className="space-y-7">
          {groupedAssets.map((section) => (
            <section key={section.id}>
              <div className="mb-3 flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-text-primary">{section.name}</h2>
                <span className="rounded bg-background-secondary px-2 py-0.5 text-xs text-text-muted">
                  {section.assets.length}
                </span>
              </div>
              <div
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                onDragEnter={handleGridDragEvent}
                onDragOver={handleGridDragEvent}
                onDrop={(event) => { void handleGridDrop(event); }}
              >
                {section.assets.map((asset) => renderAssetCard(asset, section.assets))}
              </div>
            </section>
          ))}
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-50 w-44 overflow-hidden rounded-lg border border-border bg-white py-1 shadow-lg"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 190),
            top: Math.min(contextMenu.y, window.innerHeight - 110),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => openTagModal(contextMenu.asset)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-background-secondary hover:text-primary"
          >
            <Tag className="h-4 w-4" />
            打标签
          </button>
          {isSearchMode && (
            <button
              onClick={() => locateAssetGroup(contextMenu.asset)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-background-secondary hover:text-primary"
            >
              <FolderOpen className="h-4 w-4" />
              定位到原分组位置
            </button>
          )}
          <button
            onClick={() => openMoveModal(contextMenu.asset)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-background-secondary hover:text-primary"
          >
            <MoveRight className="h-4 w-4" />
            移动至分组
          </button>
          <button
            onClick={() => handleDelete(contextMenu.asset.id)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" />
            删除图片
          </button>
        </div>
      )}

      {movingAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-text-primary">移动至分组</h2>
                <p className="mt-0.5 truncate text-xs text-text-muted">{movingAsset.displayFilename || movingAsset.originalFilename}</p>
              </div>
              <button
                onClick={() => setMovingAsset(null)}
                className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-text-primary"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <label className="block text-sm font-medium text-text-primary">
                分组
                <select
                  value={moveGroupId}
                  onChange={(e) => { setMoveGroupId(e.target.value); setMoveSubgroupId(''); }}
                  disabled={moving}
                  className="mt-2 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                >
                  <option value="">请选择分组</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-text-primary">
                子分组
                <select
                  value={moveSubgroupId}
                  onChange={(e) => setMoveSubgroupId(e.target.value)}
                  disabled={moving || !moveGroupId}
                  className="mt-2 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                >
                  <option value="">不指定子分组</option>
                  {groups.find((group) => group.id === moveGroupId)?.subgroups?.map((subgroup) => (
                    <option key={subgroup.id} value={subgroup.id}>{subgroup.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button
                onClick={() => setMovingAsset(null)}
                disabled={moving}
                className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-background-secondary"
              >
                取消
              </button>
              <button
                onClick={handleMoveAsset}
                disabled={moving || !moveGroupId}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoveRight className="h-4 w-4" />}
                移动
              </button>
            </div>
          </div>
        </div>
      )}

      {taggingAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-text-primary">给图片打标签</h2>
                <p className="mt-0.5 truncate text-xs text-text-muted">{taggingAsset.displayFilename || taggingAsset.originalFilename}</p>
              </div>
              <button
                onClick={() => setTaggingAsset(null)}
                className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-text-primary"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <label className="block text-sm font-medium text-text-primary">
                新建或添加标签
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagInputKeyDown}
                  placeholder="输入标签名，按回车创建；多个用空格或逗号分隔"
                  disabled={applyingTag}
                  className="mt-2 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  autoFocus
                />
              </label>

              {taggingAsset.tags.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-text-secondary">当前标签</p>
                  <div className="flex flex-wrap gap-1.5">
                    {taggingAsset.tags.map((tagItem) => (
                      <span key={tagItem.id} className="inline-flex items-center gap-1 rounded bg-primary-light px-2 py-1 text-xs text-primary">
                        #{tagItem.name}
                        <button
                          onClick={() => removeTag(taggingAsset, tagItem.id)}
                          className="rounded text-primary hover:text-danger"
                          aria-label="删除标签"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <label className="block text-sm font-medium text-text-primary">
                从已有标签选择
                <select
                  value={selectedTagId}
                  onChange={(e) => setSelectedTagId(e.target.value)}
                  disabled={applyingTag}
                  className="mt-2 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                >
                  <option value="">请选择标签</option>
                  {tags.map((tagItem) => (
                    <option key={tagItem.id} value={tagItem.id}>{tagItem.name}</option>
                  ))}
                </select>
              </label>
              {tags.length === 0 && (
                <p className="rounded-lg bg-background-secondary px-3 py-2 text-xs text-text-muted">
                  还没有可用标签，请先到标签管理创建标签。
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button
                onClick={() => setTaggingAsset(null)}
                disabled={applyingTag}
                className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-background-secondary"
              >
                取消
              </button>
              <button
                onClick={() => selectedTagId ? applyTagIds([selectedTagId]) : applyTagNames(tagInput.split(/[,，、\s]+/))}
                disabled={applyingTag || (!selectedTagId && !tagInput.trim())}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {applyingTag ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                {tagInput.trim() ? '创建并添加' : '添加标签'}
              </button>
            </div>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-background-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            上一页
          </button>
          <span className="text-sm text-text-muted">
            第 {page} / {totalPages} 页
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-background-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            下一页
          </button>
        </div>
      )}

      {detailAssetId && (
        <AssetDetailModal
          assetId={detailAssetId}
          onPrev={handleDetailPrev}
          onNext={handleDetailNext}
          onChanged={() => {
            fetchAssets();
            fetchGroupsAndTags();
          }}
          onClose={() => {
            setDetailAssetId(null);
            fetchAssets();
            fetchGroupsAndTags();
          }}
        />
      )}
    </div>
  );
}
