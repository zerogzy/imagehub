export interface AssetDetail {
  id: string;
  originalFilename: string;
  displayFilename: string | null;
  storageKey: string;
  mimeType: string;
  mediaType: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  sizeBytes: string;
  status: string;
  createdAt: string;
  derivatives: {
    id: string;
    derivativeType: string;
    storageKey: string;
    width: number | null;
    height: number | null;
  }[];
  groupAssets: {
    group: { id: string; name: string; slug: string };
    subgroup: { id: string; name: string } | null;
  }[];
  assetTags: { tag: { id: string; name: string }; source: string }[];
  downloadShares?: {
    id: string;
    shareId: string;
    downloadCount: number;
    lastAccessedAt: string | null;
    createdAt: string;
  }[];
  stats?: { viewCount: number; downloadCount: number };
}

export interface GroupItem {
  id: string;
  name: string;
  subgroups?: { id: string; name: string }[];
}

export interface TagItem {
  id: string;
  name: string;
}

export interface ZoomState {
  scale: number;
  originX: number;
  originY: number;
  offsetX: number;
  offsetY: number;
}
