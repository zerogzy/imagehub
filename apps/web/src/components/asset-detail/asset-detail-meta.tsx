'use client';

import {
  Calendar,
  Download,
  Eye,
  Film,
  FolderOpen,
  Maximize2,
  Play,
  Tag,
  X,
} from 'lucide-react';
import { formatDateTime, formatDuration, formatFileSize } from '@/lib/utils';
import type { AssetDetail } from './types';

interface AssetDetailMetaProps {
  asset: AssetDetail;
  isAdmin: boolean;
  onRemoveTag?: (tagId: string) => void;
}

/**
 * 信息面板的纯展示部分: 元数据 + 分组 + 标签。管理员见删除按钮; 操作按钮在 admin-actions 里。
 */
export function AssetDetailMeta({ asset, isAdmin, onRemoveTag }: AssetDetailMetaProps) {
  return (
    <>
      <h2 className="text-lg font-semibold text-text-primary">
        {asset.displayFilename || asset.originalFilename}
      </h2>

      <div className="mt-4 space-y-2.5">
        {asset.width && asset.height && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Maximize2 className="h-4 w-4 text-text-muted" />
            <span>
              {asset.width} × {asset.height}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Calendar className="h-4 w-4 text-text-muted" />
          <span>{formatDateTime(asset.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Film className="h-4 w-4 text-text-muted" />
          <span>
            {formatFileSize(asset.sizeBytes.toString())} · {asset.mimeType}
          </span>
        </div>
        {asset.duration && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Play className="h-4 w-4 text-text-muted" />
            <span>时长: {formatDuration(asset.duration)}</span>
          </div>
        )}
        {asset.stats && (
          <>
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Eye className="h-4 w-4 text-text-muted" />
              <span>浏览量: {asset.stats.viewCount.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Download className="h-4 w-4 text-text-muted" />
              <span>下载量: {asset.stats.downloadCount.toLocaleString()}</span>
            </div>
          </>
        )}
      </div>

      {asset.groupAssets.length > 0 && (
        <div className="mt-5">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
            <FolderOpen className="h-4 w-4" />
            分组
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {asset.groupAssets.map((ga, i) => (
              <span
                key={i}
                className="rounded-md bg-background-secondary px-2.5 py-1 text-xs text-text-secondary"
              >
                {ga.group.name}
                {ga.subgroup && ` / ${ga.subgroup.name}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {asset.assetTags.length > 0 && (
        <div className="mt-5">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
            <Tag className="h-4 w-4" />
            标签
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {asset.assetTags.map((at) => (
              <span
                key={at.tag.id}
                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs text-primary font-medium"
              >
                {at.tag.name}
                {isAdmin && onRemoveTag && (
                  <button
                    onClick={() => onRemoveTag(at.tag.id)}
                    className="rounded text-primary hover:text-danger"
                    aria-label="删除标签"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
