'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch, slugify } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { Plus, FolderOpen, Loader2 } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableGroupRow, AdminGroup, AdminSubgroup } from './admin-group-row';
import { AdminGroupModal, GroupFormData } from './admin-group-modal';

const DEFAULT_GROUP_SLUG = 'default';

const emptyForm: GroupFormData = {
  name: '',
  slug: '',
  description: '',
  randomEnabled: false,
  randomRotateInterval: null,
};

export function AdminGroupManager() {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AdminGroup | null>(null);
  const [form, setForm] = useState<GroupFormData>(emptyForm);
  const [creatingSubgroupFor, setCreatingSubgroupFor] = useState<string | null>(null);
  const [subgroupName, setSubgroupName] = useState('');
  const [editingSubgroupId, setEditingSubgroupId] = useState<string | null>(null);
  const [editingSubgroupName, setEditingSubgroupName] = useState('');

  const token = useAuthStore((s) => s.token);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchGroups = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const result = await apiFetch<AdminGroup[]>('/groups', token);
    if (result.data) {
      const groupsWithSubs = await Promise.all(
        (result.data as any[]).map(async (g) => {
          const subResult = await apiFetch<AdminSubgroup[]>(`/groups/${g.id}/subgroups`, token!);
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

  const orderedIds = useMemo(() => groups.map((g) => g.id), [groups]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !token) return;

    const oldIndex = groups.findIndex((g) => g.id === active.id);
    const newIndex = groups.findIndex((g) => g.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const defaultIndex = groups.findIndex((g) => g.slug === DEFAULT_GROUP_SLUG);
    if (defaultIndex !== -1 && (oldIndex === defaultIndex || newIndex === defaultIndex)) {
      showToast('error', '默认分组位置固定，无法调整');
      return;
    }

    const previousOrder = groups;
    const reordered = arrayMove(groups, oldIndex, newIndex);
    setGroups(reordered);

    const result = await apiFetch('/admin/groups/reorder', token, {
      method: 'POST',
      body: JSON.stringify({ orderedIds: reordered.map((g) => g.id) }),
    });

    if (result.error) {
      showToast('error', result.error);
      setGroups(previousOrder);
      return;
    }

    showToast('success', '分组顺序已更新');
    fetchGroups();
  };

  const handleCreateGroup = async () => {
    if (!token || !form.name.trim()) return;
    const nameExists = groups.some((g) => g.name === form.name.trim());
    if (nameExists) {
      showToast('error', `分组名称 "${form.name.trim()}" 已存在`);
      return;
    }
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
    if (result.error) { showToast('error', result.error); return; }
    showToast('success', '分组创建成功');
    setShowCreateModal(false);
    setForm(emptyForm);
    fetchGroups();
  };

  const handleUpdateGroup = async () => {
    if (!token || !editingGroup) return;
    const nameExists = groups.some((g) => g.name === form.name.trim() && g.id !== editingGroup.id);
    if (nameExists) {
      showToast('error', `分组名称 "${form.name.trim()}" 已存在`);
      return;
    }
    const result = await apiFetch(`/admin/groups/${editingGroup.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        name: form.name.trim(),
        slug: form.slug || slugify(form.name),
        description: form.description || null,
        randomEnabled: form.randomEnabled,
        randomRotateInterval: form.randomRotateInterval || undefined,
      }),
    });
    if (result.error) { showToast('error', result.error); return; }
    showToast('success', '分组更新成功');
    setEditingGroup(null);
    setForm(emptyForm);
    fetchGroups();
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!token) return;
    const target = groups.find((g) => g.id === groupId);
    if (target?.slug === DEFAULT_GROUP_SLUG) {
      showToast('error', '默认分组不可删除');
      return;
    }
    if (!confirm('确定要删除此分组吗？分组内的图片将自动移动到默认分组。')) return;
    const result = await apiFetch(`/admin/groups/${groupId}`, token, { method: 'DELETE' });
    if (result.error) { showToast('error', result.error); return; }
    showToast('success', '分组已删除，图片已移动到默认分组');
    fetchGroups();
  };

  const handleCreateSubgroup = async (groupId: string) => {
    if (!token || !subgroupName.trim()) return;
    const parentGroup = groups.find((g) => g.id === groupId);
    if (parentGroup?.subgroups?.some((s) => s.name === subgroupName.trim())) {
      showToast('error', `该分组下已存在名为 "${subgroupName.trim()}" 的二级分组`);
      return;
    }
    const result = await apiFetch('/admin/subgroups', token, {
      method: 'POST',
      body: JSON.stringify({ groupId, name: subgroupName.trim() }),
    });
    if (result.error) { showToast('error', result.error); return; }
    showToast('success', '二级分组创建成功');
    setCreatingSubgroupFor(null);
    setSubgroupName('');
    fetchGroups();
  };

  const handleUpdateSubgroup = async () => {
    if (!token || !editingSubgroupId || !editingSubgroupName.trim()) return;
    const parentGroup = groups.find((g) => g.subgroups?.some((s) => s.id === editingSubgroupId));
    if (parentGroup?.subgroups?.some((s) => s.name === editingSubgroupName.trim() && s.id !== editingSubgroupId)) {
      showToast('error', `该分组下已存在名为 "${editingSubgroupName.trim()}" 的二级分组`);
      return;
    }
    const result = await apiFetch(`/admin/subgroups/${editingSubgroupId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ name: editingSubgroupName.trim() }),
    });
    if (result.error) { showToast('error', result.error); return; }
    showToast('success', '二级分组更新成功');
    setEditingSubgroupId(null);
    setEditingSubgroupName('');
    fetchGroups();
  };

  const handleDeleteSubgroup = async (subgroupId: string) => {
    if (!token) return;
    if (!confirm('确定要删除此二级分组吗？')) return;
    const result = await apiFetch(`/admin/subgroups/${subgroupId}`, token, { method: 'DELETE' });
    if (result.error) { showToast('error', result.error); return; }
    showToast('success', '二级分组已删除');
    fetchGroups();
  };

  const startEditSubgroup = (subgroup: AdminSubgroup) => {
    setEditingSubgroupId(subgroup.id);
    setEditingSubgroupName(subgroup.name);
  };

  const cancelEditSubgroup = () => {
    setEditingSubgroupId(null);
    setEditingSubgroupName('');
  };

  const toggleExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const openEditModal = (group: AdminGroup) => {
    setEditingGroup(group);
    setForm({
      name: group.name,
      slug: group.slug,
      description: group.description || '',
      randomEnabled: group.randomEnabled,
      randomRotateInterval: group.randomRotateInterval ?? null,
    });
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingGroup(null);
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
            拖动左侧手柄调整分组顺序，图片广场会同步该顺序
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {groups.map((group) => (
              <SortableGroupRow
                key={group.id}
                group={group}
                isExpanded={expandedGroups.has(group.id)}
                disableDrag={group.slug === DEFAULT_GROUP_SLUG}
                isDefaultGroup={group.slug === DEFAULT_GROUP_SLUG}
                creatingSubgroupFor={creatingSubgroupFor}
                subgroupName={subgroupName}
                editingSubgroupId={editingSubgroupId}
                editingSubgroupName={editingSubgroupName}
                onToggleExpand={toggleExpand}
                onStartCreateSubgroup={setCreatingSubgroupFor}
                onEditGroup={openEditModal}
                onDeleteGroup={handleDeleteGroup}
                onConfirmCreateSubgroup={handleCreateSubgroup}
                onCancelCreateSubgroup={() => { setCreatingSubgroupFor(null); setSubgroupName(''); }}
                onSubgroupNameChange={setSubgroupName}
                onStartEditSubgroup={startEditSubgroup}
                onConfirmEditSubgroup={handleUpdateSubgroup}
                onCancelEditSubgroup={cancelEditSubgroup}
                onEditingSubgroupNameChange={setEditingSubgroupName}
                onDeleteSubgroup={handleDeleteSubgroup}
              />
            ))}
            {groups.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-12 text-center">
                <FolderOpen className="mx-auto mb-3 h-10 w-10 text-text-muted" />
                <p className="text-sm text-text-muted">暂无分组，点击右上角创建</p>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {(showCreateModal || editingGroup) && (
        <AdminGroupModal
          mode={editingGroup ? 'edit' : 'create'}
          form={form}
          onFormChange={setForm}
          onClose={closeModal}
          onSubmit={editingGroup ? handleUpdateGroup : handleCreateGroup}
        />
      )}
    </div>
  );
}
