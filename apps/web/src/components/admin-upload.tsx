'use client';

import { useState, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch, formatFileSize } from '@/lib/utils';
import { showToast } from '@/lib/toast';
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

export function UploadCenter() {
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [groupId, setGroupId] = useState<string>('');
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = useAuthStore((s) => s.token);

  // Load groups on mount
  useState(() => {
    if (!token) return;
    apiFetch<{ id: string; name: string }[]>('/groups', token).then((result) => {
      if (result.data) setGroups(result.data as any);
    });
  });

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
    [token, groupId],
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">上传中心</h1>
          <p className="mt-1 text-sm text-text-secondary">
            支持图片、GIF、MP4 视频、MP3 音频，可拖拽或批量上传
          </p>
        </div>
        {pendingCount > 0 && (
          <button
            onClick={uploadAll}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
          >
            <Upload className="h-4 w-4" />
            上传全部 ({pendingCount})
          </button>
        )}
      </div>

      {/* Group selector */}
      {groups.length > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm font-medium text-text-secondary">上传到分组：</label>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">不指定分组</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors',
          isDragging
            ? 'border-primary bg-primary-light'
            : 'border-border bg-white hover:border-primary/50 hover:bg-primary-light/30',
        )}
      >
        <div className={cn(
          'mb-4 rounded-full p-4',
          isDragging ? 'bg-primary/20' : 'bg-primary/10',
        )}>
          <Upload className={cn(
            'h-8 w-8',
            isDragging ? 'text-primary' : 'text-primary/60',
          )} />
        </div>
        <p className="text-sm font-medium text-text-primary">
          {isDragging ? '松开以上传文件' : '拖拽文件到此处，或点击选择文件'}
        </p>
        <p className="mt-1 text-xs text-text-muted">
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
        <div className="mt-4 flex items-center gap-4 text-sm text-text-secondary">
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
