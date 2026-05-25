import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
      const result = await this.scanReadyImages();
      return this.prisma.batchJob.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          progress: 100,
          resultJson: JSON.stringify(result),
        },
      });
    } catch (error: any) {
      return this.prisma.batchJob.update({
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

  private async scanReadyImages() {
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        status: 'ready',
        mediaType: 'image',
        OR: [
          { sha256: { not: null } },
          { phash: { not: null } },
          { dhash: { not: null } },
        ],
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
    });

    let candidatesFound = 0;
    let candidatesCreated = 0;
    let candidatesUpdated = 0;

    for (let i = 0; i < assets.length; i++) {
      for (let j = i + 1; j < assets.length; j++) {
        const assetA = assets[i];
        const assetB = assets[j];
        const sha256Equal = !!assetA.sha256 && assetA.sha256 === assetB.sha256;
        const phashDistance = this.hashDistance(assetA.phash, assetB.phash);
        const dhashDistance = this.hashDistance(assetA.dhash, assetB.dhash);
        const similarityType = this.classifySimilarity(sha256Equal, phashDistance, dhashDistance);

        if (similarityType === 'unrelated') continue;
        candidatesFound++;

        const existing = await this.prisma.similarityCandidate.findUnique({
          where: {
            assetAId_assetBId: {
              assetAId: assetA.id,
              assetBId: assetB.id,
            },
          },
        });

        const data = {
          sha256Equal,
          phashDistance,
          dhashDistance,
          similarityType,
          qualityWinnerAssetId: this.pickQualityWinner(assetA, assetB),
        };

        if (existing) {
          await this.prisma.similarityCandidate.update({
            where: { id: existing.id },
            data,
          });
          candidatesUpdated++;
        } else {
          await this.prisma.similarityCandidate.create({
            data: {
              assetAId: assetA.id,
              assetBId: assetB.id,
              ...data,
            },
          });
          candidatesCreated++;
        }
      }
    }

    return {
      assetsScanned: assets.length,
      candidatesFound,
      candidatesCreated,
      candidatesUpdated,
    };
  }

  private hashDistance(hashA?: string | null, hashB?: string | null) {
    if (!hashA || !hashB || hashA.length !== hashB.length) return null;
    let distance = 0;
    for (let i = 0; i < hashA.length; i++) {
      const a = parseInt(hashA[i], 16);
      const b = parseInt(hashB[i], 16);
      if (Number.isNaN(a) || Number.isNaN(b)) return null;
      let xor = a ^ b;
      while (xor) {
        distance += xor & 1;
        xor >>= 1;
      }
    }
    return distance;
  }

  private classifySimilarity(sha256Equal: boolean, phashDistance: number | null, dhashDistance: number | null) {
    if (sha256Equal) return 'exact_duplicate';
    const distances = [phashDistance, dhashDistance].filter((value): value is number => value !== null);
    if (distances.length === 0) return 'unrelated';
    const minDistance = Math.min(...distances);
    if (minDistance <= 5) return 'highly_similar';
    if (minDistance <= 15) return 'possible_variant';
    if (minDistance <= 25) return 'same_topic';
    return 'unrelated';
  }

  private pickQualityWinner(assetA: any, assetB: any) {
    const scoreA = this.qualityScore(assetA);
    const scoreB = this.qualityScore(assetB);
    return scoreA >= scoreB ? assetA.id : assetB.id;
  }

  private qualityScore(asset: any) {
    const pixels = (asset.width || 0) * (asset.height || 0);
    return (asset.qualityScore || 0) + pixels / 1_000_000 + Number(asset.sizeBytes || 0) / 1_000_000;
  }
}
