'use client';

import { useEffect, useState } from 'react';

/**
 * 鉴权拉原图 -> blob URL。详情页给 <img> 用, DOM 里不会出现真实路径或原图直链。
 * 切图/卸载时撤销 URL 防内存泄漏。
 */
export function useAssetOriginal(params: {
  assetId: string | undefined;
  mediaType: string | undefined;
  token: string | null;
}) {
  const { assetId, mediaType, token } = params;
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !assetId || mediaType !== 'image') return;

    let cancelled = false;
    let createdUrl: string | null = null;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/assets/${assetId}/original`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const blob = await res.blob();
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      } catch {
        // 失败时占位图继续显示, 不致命
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
      setBlobUrl(null);
    };
  }, [assetId, mediaType, token]);

  return { blobUrl, loading };
}
