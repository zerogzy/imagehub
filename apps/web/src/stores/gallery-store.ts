import { create } from 'zustand';

interface GalleryState {
  currentGroupId: string | null;
  currentSubgroupId: string | null;
  currentSeed: string | null;
  sortMode: 'default' | 'newest' | 'oldest' | 'random';
  mediaType: string | null;
  selectedTag: string | null;
  searchQuery: string;
  selectedAssetIds: Set<string>;
  isMultiSelectMode: boolean;

  // Actions
  setGroup: (groupId: string | null, subgroupId?: string | null) => void;
  setSeed: (seed: string | null) => void;
  setSortMode: (mode: GalleryState['sortMode']) => void;
  setMediaType: (type: string | null) => void;
  setSelectedTag: (tag: string | null) => void;
  setSearchQuery: (query: string) => void;
  toggleSelectAsset: (assetId: string) => void;
  clearSelection: () => void;
  setMultiSelectMode: (enabled: boolean) => void;
}

export const useGalleryStore = create<GalleryState>()((set) => ({
  currentGroupId: null,
  currentSubgroupId: null,
  currentSeed: null,
  sortMode: 'default',
  mediaType: null,
  selectedTag: null,
  searchQuery: '',
  selectedAssetIds: new Set<string>(),
  isMultiSelectMode: false,

  setGroup: (groupId, subgroupId) =>
    set({ currentGroupId: groupId, currentSubgroupId: subgroupId || null }),
  setSeed: (seed) => set({ currentSeed: seed }),
  setSortMode: (mode) => set({ sortMode: mode }),
  setMediaType: (type) => set({ mediaType: type }),
  setSelectedTag: (tag) => set({ selectedTag: tag }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  toggleSelectAsset: (assetId) =>
    set((state) => {
      const newSet = new Set(state.selectedAssetIds);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return { selectedAssetIds: newSet };
    }),
  clearSelection: () => set({ selectedAssetIds: new Set() }),
  setMultiSelectMode: (enabled) =>
    set({ isMultiSelectMode: enabled, selectedAssetIds: enabled ? new Set() : new Set() }),
}));
