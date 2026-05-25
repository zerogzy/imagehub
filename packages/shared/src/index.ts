// ============================================================
// ImageHub Shared Types & Constants
// ============================================================

// ---- Media Types ----
export enum MediaType {
  IMAGE = 'image',
  GIF = 'gif',
  VIDEO = 'video',
  AUDIO = 'audio',
}

export enum AssetStatus {
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
  TRASHED = 'trashed',
}

export enum DerivativeType {
  THUMB = 'thumb',
  PREVIEW = 'preview',
  LARGE = 'large',
  VIDEO_COVER = 'video_cover',
  AUDIO_COVER = 'audio_cover',
  WAVEFORM = 'waveform',
}

// ---- Token / Auth ----
export enum TokenRole {
  VISITOR = 'visitor',
  ADMIN = 'admin',
}

export enum DownloadType {
  TEMP_SINGLE = 'temp_single',
  TEMP_BATCH = 'temp_batch',
}

// ---- Similarity ----
export enum SimilarityType {
  EXACT_DUPLICATE = 'exact_duplicate',
  HIGHLY_SIMILAR = 'highly_similar',
  POSSIBLE_VARIANT = 'possible_variant',
  SAME_TOPIC = 'same_topic',
  UNRELATED = 'unrelated',
}

export enum SimilarityStatus {
  PENDING = 'pending',
  KEPT_BOTH = 'kept_both',
  DELETE_A = 'delete_a',
  DELETE_B = 'delete_b',
  MARKED_VARIANT = 'marked_variant',
  IGNORED = 'ignored',
  RESOLVED = 'resolved',
}

// ---- Batch Jobs ----
export enum JobType {
  UPLOAD_PROCESS = 'upload_process',
  BATCH_TAG = 'batch_tag',
  BATCH_MOVE_GROUP = 'batch_move_group',
  BATCH_DELETE = 'batch_delete',
  BATCH_DOWNLOAD_ZIP = 'batch_download_zip',
  SIMILARITY_SCAN = 'similarity_scan',
  BACKUP_EXPORT = 'backup_export',
  STATS_FLUSH = 'stats_flush',
}

export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// ---- Access Events ----
export enum EventType {
  DETAIL_VIEW = 'detail_view',
  DOWNLOAD = 'download',
  API_DETAIL = 'api_detail',
  BATCH_DOWNLOAD = 'batch_download',
  PERMANENT_SHARE_DOWNLOAD = 'permanent_share_download',
}

// ---- Tag Source ----
export enum TagSource {
  ADMIN = 'admin',
  BATCH = 'batch',
  IMPORT = 'import',
  SYSTEM_SUGGESTED = 'system_suggested',
}

// ---- API Response Types ----
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface GalleryQuery extends PaginationParams {
  groupId?: string;
  subgroupId?: string;
  seed?: string;
  sortMode?: 'default' | 'newest' | 'oldest' | 'random';
  mediaType?: MediaType;
  tag?: string;
}

// ---- Supported MIME types ----
export const SUPPORTED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
] as const;

export const SUPPORTED_GIF_MIMES = [
  'image/gif',
] as const;

export const SUPPORTED_VIDEO_MIMES = [
  'video/mp4',
] as const;

export const SUPPORTED_AUDIO_MIMES = [
  'audio/mpeg',
] as const;

export const ALL_SUPPORTED_MIMES = [
  ...SUPPORTED_IMAGE_MIMES,
  ...SUPPORTED_GIF_MIMES,
  ...SUPPORTED_VIDEO_MIMES,
  ...SUPPORTED_AUDIO_MIMES,
] as const;

// ---- File extension to media type mapping ----
export function getMediaTypeFromMime(mime: string): MediaType | null {
  if (SUPPORTED_IMAGE_MIMES.includes(mime as typeof SUPPORTED_IMAGE_MIMES[number])) {
    return MediaType.IMAGE;
  }
  if (SUPPORTED_GIF_MIMES.includes(mime as typeof SUPPORTED_GIF_MIMES[number])) {
    return MediaType.GIF;
  }
  if (SUPPORTED_VIDEO_MIMES.includes(mime as typeof SUPPORTED_VIDEO_MIMES[number])) {
    return MediaType.VIDEO;
  }
  if (SUPPORTED_AUDIO_MIMES.includes(mime as typeof SUPPORTED_AUDIO_MIMES[number])) {
    return MediaType.AUDIO;
  }
  return null;
}
