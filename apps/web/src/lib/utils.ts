import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFileSize(bytes: number | string | bigint): string {
  const size = typeof bytes === 'string' ? parseInt(bytes, 10) : typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (isNaN(size) || size === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(size) / Math.log(1024));
  return `${(size / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return formatDate(d);
}

export function getMediaIcon(mediaType: string): string {
  switch (mediaType) {
    case 'image': return 'Image';
    case 'gif': return 'Film';
    case 'video': return 'Play';
    case 'audio': return 'Music';
    default: return 'File';
  }
}

export function getMediaTypeLabel(mediaType: string): string {
  switch (mediaType) {
    case 'image': return '图片';
    case 'gif': return 'GIF';
    case 'video': return '视频';
    case 'audio': return '音频';
    default: return '文件';
  }
}

export function getAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function apiFetch<T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const hasBody = !!options?.body;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (hasBody) {
      headers['Content-Type'] = 'application/json';
    }
    if (options?.headers) {
      Object.assign(headers, options.headers);
    }

    const res = await fetch(`/api/v1${path}`, {
      ...options,
      headers,
    });

    // 204 No Content 或空响应体不解析 JSON
    if (res.status === 204) {
      return { data: null, error: null };
    }

    const text = await res.text();
    if (!text) {
      if (res.ok) return { data: null, error: null };
      return { data: null, error: `请求失败 (${res.status})` };
    }

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return { data: null, error: `响应解析失败 (${res.status})` };
    }

    if (!res.ok || !json.success) {
      return { data: null, error: json.message || json.error?.message || '请求失败' };
    }

    return { data: json.data || json, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || '网络错误' };
  }
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w一-鿿-]/g, '')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '');
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '…';
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
