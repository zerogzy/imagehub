import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type WorkerAsset = {
  id: string;
  storageKey?: string;
  sha256: string | null;
  phash: string | null;
  dhash: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: bigint | number | null;
  qualityScore: number | null;
  createdAt?: Date;
};

type FingerprintUpdate = {
  assetId: string;
  sha256?: string | null;
  phash?: string | null;
  dhash?: string | null;
  width?: number | null;
  height?: number | null;
  qualityScore?: number | null;
};

type CandidateUpsert = {
  assetAId: string;
  assetBId: string;
  sha256Equal: boolean;
  phashDistance: number | null;
  dhashDistance: number | null;
  ssimScore?: number | null;
  diffAreaRatio?: number | null;
  similarityType: string;
  qualityWinnerAssetId: string | null;
};

const HIGHLY_SIMILAR_THRESHOLD = 4;
const POSSIBLE_VARIANT_THRESHOLD = 10;
const SAME_TOPIC_THRESHOLD = 18;
const HASH_BAND_SIZE = 4;
const INTERNAL_BATCH_SIZE = 200;
const WORKER_PAGE_SIZE = 200;

function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}

function canonicalPairId(assetAId: string, assetBId: string) {
  return assetAId < assetBId ? `${assetAId}::${assetBId}` : `${assetBId}::${assetAId}`;
}

function splitPairId(pairId: string) {
  const separatorIndex = pairId.indexOf('::');
  if (separatorIndex === -1) {
    return { assetAId: pairId, assetBId: '' };
  }
  return {
    assetAId: pairId.slice(0, separatorIndex),
    assetBId: pairId.slice(separatorIndex + 2),
  };
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeHash(hash?: string | null) {
  return hash?.trim().toLowerCase() || null;
}

@Injectable()
export class SimilarityService {
  constructor(private prisma: PrismaService) {}

  async getCandidates(params: { status?: string; page?: number; pageSize?: number }) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const where: any = {};
    if (params.status) where.status = params.status;

    const [candidates, total] = await Promise.all([
      this.prisma.similarityCandidate.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          assetA: {
            select: {
              id: true,
              originalFilename: true,
              mediaType: true,
              width: true,
              height: true,
              sizeBytes: true,
              qualityScore: true,
              derivatives: {
                where: { derivativeType: 'thumb' },
                take: 1,
                select: {
                  id: true,
                  storageKey: true,
                  width: true,
                  height: true,
                },
              },
            },
          },
          assetB: {
            select: {
              id: true,
              originalFilename: true,
              mediaType: true,
              width: true,
              height: true,
              sizeBytes: true,
              qualityScore: true,
              derivatives: {
                where: { derivativeType: 'thumb' },
                take: 1,
                select: {
                  id: true,
                  storageKey: true,
                  width: true,
                  height: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.similarityCandidate.count({ where }),
    ]);

    return {
      candidates: serializeBigInt(candidates),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async triggerScan() {
    const job = await this.prisma.batchJob.create({
      data: {
        jobType: 'similarity_scan',
        status: 'running',
        payloadJson: JSON.stringify({ scanAll: true }),
        progress: 5,
      },
    });

    try {
      const result = await this.executeScan(job.id);
      return await this.prisma.batchJob.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          progress: 100,
          resultJson: JSON.stringify(result),
        },
      });
    } catch (error: any) {
      return await this.prisma.batchJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          progress: 100,
          errorMessage: error?.message || 'Similarity scan failed',
        },
      });
    }
  }

  async resolveCandidate(
    candidateId: string,
    resolution: { status: string; qualityWinnerAssetId?: string },
  ) {
    return this.prisma.similarityCandidate.update({
      where: { id: candidateId },
      data: {
        status: resolution.status,
        qualityWinnerAssetId: resolution.qualityWinnerAssetId,
      },
    });
  }

  async listWorkerAssets(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    mediaType?: string;
    assetIds?: string[];
  }) {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(500, Math.max(1, params.pageSize || WORKER_PAGE_SIZE));
    const where: any = {
      status: params.status || 'ready',
      mediaType: params.mediaType || 'image',
    };

    if (params.assetIds?.length) {
      where.id = { in: params.assetIds };
    }

    const [assets, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          storageKey: true,
          sha256: true,
          phash: true,
          dhash: true,
          width: true,
          height: true,
          sizeBytes: true,
          qualityScore: true,
          createdAt: true,
        },
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);

    return {
      assets: serializeBigInt(assets),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async bulkUpdateFingerprints(fingerprints: FingerprintUpdate[]) {
    const normalized = fingerprints.filter((item) => item.assetId);
    let updated = 0;

    for (const batch of chunk(normalized, INTERNAL_BATCH_SIZE)) {
      await Promise.all(
        batch.map(async (fingerprint) => {
          const data: any = {};
          if (fingerprint.sha256 !== undefined) data.sha256 = fingerprint.sha256;
          if (fingerprint.phash !== undefined) data.phash = fingerprint.phash;
          if (fingerprint.dhash !== undefined) data.dhash = fingerprint.dhash;
          if (fingerprint.width !== undefined) data.width = fingerprint.width;
          if (fingerprint.height !== undefined) data.height = fingerprint.height;
          if (fingerprint.qualityScore !== undefined) data.qualityScore = fingerprint.qualityScore;

          if (Object.keys(data).length === 0) return;

          await this.prisma.mediaAsset.update({
            where: { id: fingerprint.assetId },
            data,
          });
          updated += 1;
        }),
      );
    }

    return { updated };
  }

  async bulkUpsertCandidates(candidates: CandidateUpsert[]) {
    if (!candidates.length) {
      return { created: 0, updated: 0, total: 0 };
    }

    const normalized = candidates
      .filter((candidate) => candidate.assetAId && candidate.assetBId)
      .map((candidate) => {
        const ordered = this.normalizeCandidatePair(candidate);
        return ordered;
      });

    const assetIds = Array.from(
      new Set(normalized.flatMap((candidate) => [candidate.assetAId, candidate.assetBId])),
    );

    const existingPairs = await this.prisma.similarityCandidate.findMany({
      where: {
        assetAId: { in: assetIds },
        assetBId: { in: assetIds },
      },
      select: {
        assetAId: true,
        assetBId: true,
      },
    });

    const existingPairKeys = new Set(
      existingPairs.map((candidate) => canonicalPairId(candidate.assetAId, candidate.assetBId)),
    );

    let created = 0;
    let updated = 0;

    for (const batch of chunk(normalized, INTERNAL_BATCH_SIZE)) {
      await Promise.all(
        batch.map(async (candidate) => {
          const pairKey = canonicalPairId(candidate.assetAId, candidate.assetBId);
          const data = {
            sha256Equal: candidate.sha256Equal,
            phashDistance: candidate.phashDistance,
            dhashDistance: candidate.dhashDistance,
            ssimScore: candidate.ssimScore ?? null,
            diffAreaRatio: candidate.diffAreaRatio ?? null,
            similarityType: candidate.similarityType,
            qualityWinnerAssetId: candidate.qualityWinnerAssetId,
          };

          await this.prisma.similarityCandidate.upsert({
            where: {
              assetAId_assetBId: {
                assetAId: candidate.assetAId,
                assetBId: candidate.assetBId,
              },
            },
            update: data,
            create: {
              assetAId: candidate.assetAId,
              assetBId: candidate.assetBId,
              ...data,
            },
          });

          if (existingPairKeys.has(pairKey)) {
            updated += 1;
          } else {
            created += 1;
            existingPairKeys.add(pairKey);
          }
        }),
      );
    }

    return { created, updated, total: normalized.length };
  }

  private async executeScan(jobId: string) {
    const workerUrl = this.getWorkerUrl();
    if (workerUrl) {
      try {
        return await this.runWorkerScan(workerUrl, jobId);
      } catch (error) {
        console.warn(`Similarity worker scan failed, falling back to local scan: ${error}`);
      }
    }

    return this.scanReadyImagesOptimized();
  }

  private async runWorkerScan(workerUrl: string, jobId: string) {
    const fetchFn = (globalThis as any).fetch;
    const response = await fetchFn(`${workerUrl}/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.getWorkerToken() ? { 'X-ImageHub-Token': this.getWorkerToken() } : {}),
      },
      body: JSON.stringify({ job_id: jobId, scan_all: true }),
    });

    if (!response.ok) {
      throw new Error(`Worker scan failed with status ${response.status}`);
    }

    const payload = await response.json();
    if (!payload?.success) {
      throw new Error(payload?.detail || 'Worker scan returned an error');
    }

    return payload.data || payload;
  }

  private async scanReadyImagesOptimized() {
    const assets = (await this.prisma.mediaAsset.findMany({
      where: {
        status: 'ready',
        mediaType: 'image',
      },
      select: {
        id: true,
        sha256: true,
        phash: true,
        dhash: true,
        width: true,
        height: true,
        sizeBytes: true,
        qualityScore: true,
      },
      orderBy: { createdAt: 'asc' },
    })) as WorkerAsset[];

    const assetMap = new Map<string, WorkerAsset>();
    const shaBuckets = new Map<string, string[]>();
    const perceptualBuckets = new Map<string, string[]>();

    for (const asset of assets) {
      const normalizedAsset = this.normalizeAsset(asset);
      assetMap.set(normalizedAsset.id, normalizedAsset);

      if (normalizedAsset.sha256) {
        this.pushBucket(shaBuckets, `sha256:${normalizedAsset.sha256}`, normalizedAsset.id);
      }
      if (normalizedAsset.phash) {
        for (const bucketKey of this.bucketKeys('phash', normalizedAsset.phash)) {
          this.pushBucket(perceptualBuckets, bucketKey, normalizedAsset.id);
        }
      }
      if (normalizedAsset.dhash) {
        for (const bucketKey of this.bucketKeys('dhash', normalizedAsset.dhash)) {
          this.pushBucket(perceptualBuckets, bucketKey, normalizedAsset.id);
        }
      }
    }

    const pairKeys = new Set<string>();
    const exactPairKeys = new Set<string>();

    for (const ids of shaBuckets.values()) {
      if (ids.length < 2) continue;
      for (const pairKey of this.expandPairs(ids)) {
        pairKeys.add(pairKey);
        exactPairKeys.add(pairKey);
      }
    }

    for (const ids of perceptualBuckets.values()) {
      if (ids.length < 2) continue;
      for (const pairKey of this.expandPairs(ids)) {
        pairKeys.add(pairKey);
      }
    }

    const candidateMap = new Map<string, CandidateUpsert>();

    for (const pairKey of pairKeys) {
      const { assetAId, assetBId } = splitPairId(pairKey);
      const assetA = assetMap.get(assetAId);
      const assetB = assetMap.get(assetBId);
      if (!assetA || !assetB) continue;

      const sha256Equal = !!assetA.sha256 && assetA.sha256 === assetB.sha256;
      const phashDistance = this.hashDistance(assetA.phash, assetB.phash);
      const dhashDistance = this.hashDistance(assetA.dhash, assetB.dhash);
      const similarityType = this.classifySimilarity(
        sha256Equal || exactPairKeys.has(pairKey),
        phashDistance,
        dhashDistance,
      );

      if (similarityType === 'unrelated') continue;

      candidateMap.set(pairKey, {
        assetAId,
        assetBId,
        sha256Equal: sha256Equal || exactPairKeys.has(pairKey),
        phashDistance,
        dhashDistance,
        similarityType,
        qualityWinnerAssetId: this.pickQualityWinner(assetA, assetB),
      });
    }

    const candidates = [...candidateMap.values()];
    const { created, updated, total } = await this.bulkUpsertCandidates(candidates);

    return {
      assetsScanned: assets.length,
      candidatesFound: total,
      candidatesCreated: created,
      candidatesUpdated: updated,
    };
  }

  private normalizeAsset(asset: WorkerAsset) {
    return {
      ...asset,
      sha256: normalizeHash(asset.sha256),
      phash: normalizeHash(asset.phash),
      dhash: normalizeHash(asset.dhash),
    };
  }

  private normalizeCandidatePair(candidate: CandidateUpsert) {
    if (candidate.assetAId < candidate.assetBId) return candidate;
    return {
      ...candidate,
      assetAId: candidate.assetBId,
      assetBId: candidate.assetAId,
    };
  }

  private getWorkerUrl() {
    return (
      process.env.SIMILARITY_WORKER_URL?.replace(/\/+$/, '') ||
      process.env.WORKER_URL?.replace(/\/+$/, '') ||
      ''
    );
  }

  private getWorkerToken() {
    return (
      process.env.WORKER_TOKEN ||
      process.env.ADMIN_TOKEN ||
      process.env.INTERNAL_API_TOKEN ||
      ''
    );
  }

  private pushBucket(bucketMap: Map<string, string[]>, bucketKey: string, assetId: string) {
    const bucket = bucketMap.get(bucketKey);
    if (bucket) {
      bucket.push(assetId);
    } else {
      bucketMap.set(bucketKey, [assetId]);
    }
  }

  private expandPairs(assetIds: string[]) {
    const pairs: string[] = [];
    for (let left = 0; left < assetIds.length; left += 1) {
      for (let right = left + 1; right < assetIds.length; right += 1) {
        pairs.push(canonicalPairId(assetIds[left], assetIds[right]));
      }
    }
    return pairs;
  }

  private bucketKeys(prefix: 'phash' | 'dhash', hash: string) {
    const keys: string[] = [];
    for (let offset = 0; offset < hash.length; offset += HASH_BAND_SIZE) {
      keys.push(`${prefix}:${Math.floor(offset / HASH_BAND_SIZE)}:${hash.slice(offset, offset + HASH_BAND_SIZE)}`);
    }
    return keys;
  }

  private hashDistance(hashA?: string | null, hashB?: string | null) {
    if (!hashA || !hashB || hashA.length !== hashB.length) return null;
    let distance = 0;
    for (let index = 0; index < hashA.length; index += 1) {
      const a = parseInt(hashA[index], 16);
      const b = parseInt(hashB[index], 16);
      if (Number.isNaN(a) || Number.isNaN(b)) return null;
      let xor = a ^ b;
      while (xor) {
        distance += xor & 1;
        xor >>= 1;
      }
    }
    return distance;
  }

  private classifySimilarity(
    sha256Equal: boolean,
    phashDistance: number | null,
    dhashDistance: number | null,
  ) {
    if (sha256Equal) return 'exact_duplicate';
    const distances = [phashDistance, dhashDistance].filter(
      (value): value is number => value !== null,
    );
    if (distances.length === 0) return 'unrelated';
    const minDistance = Math.min(...distances);
    if (minDistance <= HIGHLY_SIMILAR_THRESHOLD) return 'highly_similar';
    if (minDistance <= POSSIBLE_VARIANT_THRESHOLD) return 'possible_variant';
    if (minDistance <= SAME_TOPIC_THRESHOLD) return 'same_topic';
    return 'unrelated';
  }

  private pickQualityWinner(assetA: WorkerAsset, assetB: WorkerAsset) {
    const scoreA = this.qualityScore(assetA);
    const scoreB = this.qualityScore(assetB);
    return scoreA >= scoreB ? assetA.id : assetB.id;
  }

  private qualityScore(asset: WorkerAsset) {
    const width = asset.width || 0;
    const height = asset.height || 0;
    const pixels = width * height;
    const sizeBytes = Number(asset.sizeBytes || 0);
    const qualityScore = asset.qualityScore || 0;
    return qualityScore + pixels / 1_000_000 + sizeBytes / 1_000_000;
  }
}
