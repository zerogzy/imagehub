'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch, formatFileSize } from '@/lib/utils';
import {
  Upload,
  X,
  FileImage,
  Film,
  Music,
  Loader2,
  CheckCircle,
  AlertCircle,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Search,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  result?: { id: string; originalFilename: string; mediaType: string };
}

interface UploadSubgroup {
  id: string;
  name: string;
  _count?: { groupAssets: number };
}

interface UploadGroup {
  id: string;
  name: string;
  _count?: { groupAssets: number; subgroups: number };
  subgroups?: UploadSubgroup[];
}

export function UploadCenter() {
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [groupId, setGroupId] = useState<string>('');
  const [subgroupId, setSubgroupId] = useState<string>('');
  const [groups, setGroups] = useState<UploadGroup[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = useAuthStore((s) => s.token);
  const selectedGroup = groups.find((group) => group.id === groupId);
  const selectedSubgroup = selectedGroup?.subgroups?.find((s) => s.id === subgroupId);

  useEffect(() => {
    if (!token) return;
    apiFetch<UploadGroup[]>('/groups', token).then((result) => {
      if (result.data) {
        setGroups(result.data);
        const firstGroup = result.data[0];
        if (firstGroup) {
          setGroupId((current) => current || firstGroup.id);
        }
      }
    });
  }, [token]);

  useEffect(() => {
    if (!selectedGroup) return;
    if (subgroupId && !selectedGroup.subgroups?.some((s) => s.id === subgroupId)) {
      setSubgroupId('');
    }
  }, [selectedGroup, subgroupId]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filteredGroups = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      if (g.name.toLowerCase().includes(q)) return true;
      return g.subgroups?.some((s) => s.name.toLowerCase().includes(q));
    });
  }, [groups, searchFilter]);

  const selectGroup = useCallback((gId: string, sId: string = '') => {
    setGroupId(gId);
    setSubgroupId(sId);
    setPanelOpen(false);
  }, []);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const uploadingFiles: UploadingFile[] = Array.from(newFiles).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      progress: 0,
      status: 'pending' as const,
    }));
    setFiles((prev) => [...prev, ...uploadingFiles]);
  }, []);

  const uploadFile = useCallback(
    async (uploadingFile: UploadingFile) => {
      if (!token) return;

      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadingFile.id
            ? { ...f, status: 'uploading' as const, progress: 10 }
            : f,
        ),
      );

      const formData = new FormData();
      formData.append('file', uploadingFile.file);
      if (groupId) formData.append('groupId', groupId);
      if (groupId && subgroupId) formData.append('subgroupId', subgroupId);

      try {
        const res = await fetch('/api/v1/admin/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        const json = await res.json();

        if (!res.ok || !json.success) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === uploadingFile.id
                ? {
                    ...f,
                    status: 'error' as const,
                    progress: 100,
                    error: json.error?.message || '上传失败',
                  }
                : f,
            ),
          );
          return;
        }

        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadingFile.id
              ? {
                  ...f,
                  status: 'success' as const,
                  progress: 100,
                  result: json.data,
                }
              : f,
          ),
        );
      } catch {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadingFile.id
              ? {
                  ...f,
                  status: 'error' as const,
                  progress: 100,
                  error: '网络错误',
                }
              : f,
          ),
        );
      }
    },
    [token, groupId, subgroupId],
  );

  const uploadAll = useCallback(() => {
    const pendingFiles = files.filter((f) => f.status === 'pending');
    pendingFiles.forEach((f) => uploadFile(f));
  }, [files, uploadFile]);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const successCount = files.filter((f) => f.status === 'success').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const pendingCount = files.filter((f) => f.status === 'pending' || f.status === 'uploading').length;

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('video/')) return <Film className="h-5 w-5 text-primary" />;
    if (file.type.startsWith('audio/')) return <Music className="h-5 w-5 text-warning" />;
    return <FileImage className="h-5 w-5 text-success" />;
  };

  const summary = selectedGroup
    ? selectedSubgroup
      ? `${selectedGroup.name} / ${selectedSubgroup.name}`
      : selectedGroup.name
    : '请选择分组';

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">上传中心</h1>
          <p className="mt-1 text-sm text-text-secondary">
            支持图片、GIF、MP4 视频、MP3 音频，可拖拽或批量上传
          </p>
        </div>
        {pendingCount > 0 && (
          <button
            onClick={uploadAll}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover sm:w-auto"
          >
            <Upload className="h-4 w-4" />
            上传全部 ({pendingCount})
          </button>
        )}
      </div>

      {/* 可收缩分组面板 */}
      {groups.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-xl border border-border bg-white">
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-background-secondary sm:px-4"
            aria-expanded={panelOpen}
          >
            <FolderOpen className="h-4 w-4 shrink-0 text-text-muted" />
            <span className="shrink-0 text-text-secondary">上传到：</span>
            <span className="truncate font-medium text-text-primary">{summary}</span>
            {panelOpen ? (
              <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-text-muted" />
            ) : (
              <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-text-muted" />
            )}
          </button>

          {panelOpen && (
            <div className="border-t border-border">
              <div className="px-3 py-2 sm:px-4">
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

              <div className="max-h-72 overflow-y-auto px-2 pb-2 sm:max-h-80">
                {filteredGroups.length === 0 && (
                  <p className="px-3 py-4 text-center text-xs text-text-muted">
                    没有匹配的分组
                  </p>
                )}
                {filteredGroups.map((group) => {
                  const isGroupSelected = groupId === group.id && !subgroupId;
                  const expanded = expandedGroupIds.has(group.id);
                  const hasSubgroups = (group.subgroups?.length ?? 0) > 0;
                  return (
                    <div key={group.id}>
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => selectGroup(group.id)}
                          className={cn(
                            'flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                            isGroupSelected
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-text-secondary hover:bg-background-secondary',
                          )}
                        >
                          <FolderOpen className="h-4 w-4 shrink-0" />
                          <span className="truncate">{group.name}</span>
                          {typeof group._count?.groupAssets === 'number' && (
                            <span className="ml-auto shrink-0 text-xs text-text-muted">
                              {group._count.groupAssets}
                            </span>
                          )}
                          {isGroupSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                        </button>
                        {hasSubgroups && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(group.id)}
                            className="rounded p-1 text-text-muted hover:bg-background-secondary"
                            aria-label={expanded ? '收起' : '展开'}
                          >
                            <ChevronRight
                              className={cn(
                                'h-3.5 w-3.5 transition-transform',
                                expanded && 'rotate-90',
                              )}
                            />
                          </button>
                        )}
                      </div>

                      {expanded && hasSubgroups && (
                        <div className="ml-4 border-l border-border pl-2">
                          {group.subgroups!.map((sub) => {
                            const isSubSelected = groupId === group.id && subgroupId === sub.id;
                            return (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => selectGroup(group.id, sub.id)}
                                className={cn(
                                  'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors',
                                  isSubSelected
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'text-text-muted hover:bg-background-secondary hover:text-text-secondary',
                                )}
                              >
                                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{sub.name}</span>
                                {typeof sub._count?.groupAssets === 'number' && (
                                  <span className="ml-auto shrink-0 text-xs text-text-muted">
                                    {sub._count.groupAssets}
                                  </span>
                                )}
                                {isSubSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors sm:p-10 md:p-12',
          isDragging
            ? 'border-primary bg-primary-light'
            : 'border-border bg-white hover:border-primary/50 hover:bg-primary-light/30',
        )}
      >
        <div className={cn(
          'mb-3 rounded-full p-3 sm:mb-4 sm:p-4',
          isDragging ? 'bg-primary/20' : 'bg-primary/10',
        )}>
          <Upload className={cn(
            'h-6 w-6 sm:h-8 sm:w-8',
            isDragging ? 'text-primary' : 'text-primary/60',
          )} />
        </div>
        <p className="text-center text-sm font-medium text-text-primary">
          {isDragging ? '松开以上传文件' : '拖拽文件到此处，或点击选择文件'}
        </p>
        <p className="mt-1 text-center text-xs text-text-muted">
          支持 JPG / PNG / WebP / AVIF / HEIC / GIF / MP4 / MP3
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,image/gif,video/mp4,audio/mpeg"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />
      </div>

      {/* Stats */}
      {files.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
          <span>共 {files.length} 个文件</span>
          {successCount > 0 && (
            <span className="flex items-center gap-1 text-success">
              <CheckCircle className="h-3.5 w-3.5" /> {successCount} 成功
            </span>
          )}
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-danger">
              <AlertCircle className="h-3.5 w-3.5" /> {errorCount} 失败
            </span>
          )}
          <button
            onClick={() => setFiles([])}
            className="ml-auto text-text-muted hover:text-danger transition-colors"
          >
            清空列表
          </button>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((f) => (
            <div
              key={f.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border bg-white p-3 transition-colors',
                f.status === 'success' ? 'border-success/30' :
                f.status === 'error' ? 'border-danger/30' : 'border-border',
              )}
            >
              {getFileIcon(f.file)}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">
                  {f.file.name}
                </p>
                <p className="text-xs text-text-muted">
                  {formatFileSize(f.file.size)}
                  {f.status === 'success' && f.result && (
                    <span className="ml-2 text-success">已上传</span>
                  )}
                  {f.status === 'error' && f.error && (
                    <span className="ml-2 text-danger">{f.error}</span>
                  )}
                </p>
                {f.status === 'uploading' && (
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}
              </div>

              {f.status === 'uploading' && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
              {f.status === 'success' && (
                <CheckCircle className="h-4 w-4 text-success" />
              )}
              {f.status === 'error' && (
                <AlertCircle className="h-4 w-4 text-danger" />
              )}

              <button
                onClick={() => removeFile(f.id)}
                className="rounded p-1 text-text-muted hover:bg-background-secondary hover:text-danger transition-colors"
                aria-label="移除"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
