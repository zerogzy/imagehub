'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/utils';
import type { AssetDetail, GroupItem, TagItem } from './types';

/**
 * 加载 asset 详情 (任何 token 可见) + 管理员选项 (分组/标签下拉)。
 * 暴露 reload 给外部组件在写操作后触发刷新。
 */
export function useAssetDetail(params: {
  assetId: string;
  token: string | null;
  isAdmin: boolean;
}) {
  const { assetId, token, isAdmin } = params;
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);

  const loadAsset = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const result = await apiFetch<AssetDetail>(`/assets/${assetId}`, token);
    if (result.data) setAsset(result.data);
    setLoading(false);
  }, [assetId, token]);

  const loadAdminOptions = useCallback(async () => {
    if (!token || !isAdmin) return;
    const [groupsResult, tagsResult] = await Promise.all([
      apiFetch<GroupItem[]>('/groups', token),
      apiFetch<TagItem[]>('/tags', token),
    ]);
    if (groupsResult.data) setGroups(groupsResult.data);
    if (tagsResult.data) setTags(tagsResult.data);
  }, [token, isAdmin]);

  useEffect(() => {
    if (!token) return;
    loadAsset();
    loadAdminOptions();
  }, [assetId, token, loadAsset, loadAdminOptions]);

  return { asset, loading, groups, tags, loadAsset, loadAdminOptions };
}
