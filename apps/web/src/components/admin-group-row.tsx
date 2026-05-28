'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import {
  FolderOpen,
  Trash2,
  Edit3,
  Shuffle,
  ChevronRight,
  Check,
  GripVertical,
  FolderPlus,
  X,
} from 'lucide-react';

export interface AdminSubgroup {
  id: string;
  name: string;
  description?: string;
  rankKey: string;
  _count?: { groupAssets: number };
}

export interface AdminGroup {
  id: string;
  name: string;
  slug: string;
  description?: string;
  rankKey: string;
  randomEnabled: boolean;
  randomRotateInterval?: number | null;
  currentSeed?: string | null;
  _count: { groupAssets: number; subgroups: number };
  subgroups?: AdminSubgroup[];
}

interface SortableGroupRowProps {
  group: AdminGroup;
  isExpanded: boolean;
  disableDrag: boolean;
  creatingSubgroupFor: string | null;
  subgroupName: string;
  editingSubgroupId: string | null;
  editingSubgroupName: string;
  onToggleExpand: (id: string) => void;
  onStartCreateSubgroup: (id: string) => void;
  onEditGroup: (group: AdminGroup) => void;
  onDeleteGroup: (id: string) => void;
  onConfirmCreateSubgroup: (id: string) => void;
  onCancelCreateSubgroup: () => void;
  onSubgroupNameChange: (name: string) => void;
  onStartEditSubgroup: (subgroup: AdminSubgroup) => void;
  onConfirmEditSubgroup: () => void;
  onCancelEditSubgroup: () => void;
  onEditingSubgroupNameChange: (name: string) => void;
  onDeleteSubgroup: (id: string) => void;
}

export function SortableGroupRow({
  group,
  isExpanded,
  disableDrag,
  creatingSubgroupFor,
  subgroupName,
  editingSubgroupId,
  editingSubgroupName,
  onToggleExpand,
  onStartCreateSubgroup,
  onEditGroup,
  onDeleteGroup,
  onConfirmCreateSubgroup,
  onCancelCreateSubgroup,
  onSubgroupNameChange,
  onStartEditSubgroup,
  onConfirmEditSubgroup,
  onCancelEditSubgroup,
  onEditingSubgroupNameChange,
  onDeleteSubgroup,
}: SortableGroupRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id, disabled: disableDrag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-xl border border-border bg-white',
        isDragging && 'shadow-lg ring-2 ring-primary/30',
      )}
    >
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={disableDrag}
          className={cn(
            'rounded p-1 text-text-muted transition-colors',
            disableDrag
              ? 'cursor-not-allowed opacity-30'
              : 'cursor-grab hover:bg-background-secondary hover:text-text-primary active:cursor-grabbing',
          )}
          title={disableDrag ? '默认分组位置固定' : '拖动调整顺序'}
          aria-label="拖动排序"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          onClick={() => onToggleExpand(group.id)}
          className="rounded p-0.5 text-text-muted hover:bg-background-secondary transition-colors"
          aria-label={isExpanded ? '收起' : '展开'}
        >
          <ChevronRight
            className={cn(
              'h-4 w-4 transition-transform',
              isExpanded ? 'rotate-90' : '',
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
            onClick={() => onStartCreateSubgroup(group.id)}
            className="rounded-lg p-2 text-text-muted hover:bg-primary/10 hover:text-primary transition-colors"
            title="添加二级分组"
            aria-label="添加二级分组"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
          <button
            onClick={() => onEditGroup(group)}
            className="rounded-lg p-2 text-text-muted hover:bg-primary/10 hover:text-primary transition-colors"
            title="编辑"
            aria-label="编辑分组"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDeleteGroup(group.id)}
            className="rounded-lg p-2 text-text-muted hover:bg-danger/10 hover:text-danger transition-colors"
            title="删除"
            aria-label="删除分组"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isExpanded && group.subgroups && group.subgroups.length > 0 && (
        <div className="border-t border-border px-4 py-2">
          {group.subgroups.map((sub) => (
            <div
              key={sub.id}
              className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-background-secondary transition-colors"
            >
              <FolderOpen className="h-4 w-4 text-text-muted" />
              {editingSubgroupId === sub.id ? (
                <>
                  <input
                    type="text"
                    value={editingSubgroupName}
                    onChange={(e) => onEditingSubgroupNameChange(e.target.value)}
                    className="h-7 flex-1 rounded-md border border-border px-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onConfirmEditSubgroup();
                      if (e.key === 'Escape') onCancelEditSubgroup();
                    }}
                  />
                  <button
                    onClick={onConfirmEditSubgroup}
                    className="rounded p-1 text-primary hover:bg-primary/10 transition-colors"
                    aria-label="确认"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={onCancelEditSubgroup}
                    className="rounded p-1 text-text-muted hover:text-text-primary transition-colors"
                    aria-label="取消"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-text-primary">{sub.name}</span>
                  <span className="text-xs text-text-muted">
                    {sub._count?.groupAssets ?? 0} 张
                  </span>
                  <button
                    onClick={() => onStartEditSubgroup(sub)}
                    className="rounded p-1 text-text-muted hover:text-primary transition-colors"
                    aria-label="编辑二级分组"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteSubgroup(sub.id)}
                    className="rounded p-1 text-text-muted hover:text-danger transition-colors"
                    aria-label="删除二级分组"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {creatingSubgroupFor === group.id && (
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={subgroupName}
              onChange={(e) => onSubgroupNameChange(e.target.value)}
              placeholder="二级分组名称"
              className="h-8 flex-1 rounded-md border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onConfirmCreateSubgroup(group.id);
                if (e.key === 'Escape') onCancelCreateSubgroup();
              }}
            />
            <button
              onClick={() => onConfirmCreateSubgroup(group.id)}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover transition-colors"
            >
              <Check className="h-3 w-3" />
              创建
            </button>
            <button
              onClick={onCancelCreateSubgroup}
              className="rounded-md px-2 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
