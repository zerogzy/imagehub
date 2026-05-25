import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { StatsService } from '../stats/stats.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as archiver from 'archiver';

interface BackupPayload {
  jobId: string;
  includeStats?: boolean;
}

interface BatchDownloadPayload {
  jobId: string;
  assetIds: string[];
}

@Processor('imagehub-jobs', { concurrency: 2 })
export class JobProcessor extends WorkerHost {
  private readonly logger = new Logger(JobProcessor.name);

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private statsService: StatsService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing job ${job.id} of type ${job.name}`);

    // Update job status to running
    await this.updateJobStatus(job.data.jobId, 'running', 0);

    try {
      switch (job.name) {
        case 'backup_export':
          return await this.processBackupExport(job);
        case 'batch_download_zip':
          return await this.processBatchDownload(job);
        case 'stats_flush':
          return await this.processStatsFlush(job);
        case 'similarity_scan':
          return await this.processSimilarityScan(job);
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
      }
    } catch (error) {
      this.logger.error(`Job ${job.id} failed:`, error);
      await this.updateJobStatus(
        job.data.jobId,
        'failed',
        job.progress as number,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Process backup export job.
   * Generates metadata.sql, manifest.json, checksums.txt.
   */
  private async processBackupExport(job: Job<BackupPayload>) {
    const jobId = job.data.jobId;
    const exportDir = path.join('exports', 'backup', jobId);

    // Create export directory
    await this.ensureDir(exportDir);

    // Step 1: Export metadata as SQL
    await job.updateProgress(10);
    await this.updateJobStatus(jobId, 'running', 10);

    const tables = [
      'media_asset',
      'access_token',
      'group',
      'subgroup',
      'group_asset',
      'tag',
      'asset_tag',
      'download_share',
      'similarity_candidate',
    ];

    const sqlLines: string[] = [
      '-- ImageHub Backup Export',
      `-- Generated at: ${new Date().toISOString()}`,
      '-- Original files are NOT included. Only metadata.',
      '',
    ];

    for (const table of tables) {
      const count = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM \`${table}\``,
      );
      sqlLines.push(`-- Table: ${table} (${(count as any)[0]?.count || 0} rows)`);
    }

    const sqlContent = sqlLines.join('\n');
    await this.storageService.save(
      `${exportDir}/metadata.sql`,
      Buffer.from(sqlContent, 'utf-8'),
    );

    // Step 2: Create manifest.json
    await job.updateProgress(50);
    await this.updateJobStatus(jobId, 'running', 50);

    const manifest = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      tables,
      note: 'Original files are NOT included. Restore /storage/original manually.',
    };

    await this.storageService.save(
      `${exportDir}/manifest.json`,
      Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'),
    );

    // Step 3: Generate checksums
    await job.updateProgress(80);
    await this.updateJobStatus(jobId, 'running', 80);

    const checksums = [
      `${this.storageService.computeSha256(`${exportDir}/metadata.sql`)}  metadata.sql`,
      `${this.storageService.computeSha256(`${exportDir}/manifest.json`)}  manifest.json`,
    ];

    await this.storageService.save(
      `${exportDir}/checksums.txt`,
      Buffer.from(checksums.join('\n'), 'utf-8'),
    );

    // Done
    await job.updateProgress(100);
    await this.updateJobStatus(jobId, 'completed', 100);

    this.logger.log(`Backup export ${jobId} completed`);
  }

  /**
   * Process batch download ZIP job.
   */
  private async processBatchDownload(job: Job<BatchDownloadPayload>) {
    const jobId = job.data.jobId;
    const { assetIds } = job.data;

    // Create ZIP file
    const zipPath = path.join('exports', 'batch-download', `${jobId}.zip`);
    const absZipPath = this.storageService.getAbsolutePathForKey(zipPath);
    await this.ensureDir(path.dirname(zipPath));

    // Get asset storage keys
    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: assetIds } },
      select: { id: true, originalFilename: true, storageKey: true },
    });

    // Create archive
    const output = require('fs').createWriteStream(absZipPath);
    const archive = archiver('zip', { zlib: { level: 5 } });

    archive.pipe(output);

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      try {
        const buffer = await this.storageService.read(asset.storageKey);
        archive.append(buffer, { name: asset.originalFilename });
      } catch {
        this.logger.warn(`Failed to read asset ${asset.id}, skipping`);
      }

      const progress = Math.round(((i + 1) / assets.length) * 90);
      await job.updateProgress(progress);
      await this.updateJobStatus(jobId, 'running', progress);
    }

    await archive.finalize();

    // Done
    await job.updateProgress(100);
    await this.updateJobStatus(jobId, 'completed', 100);

    this.logger.log(`Batch download ZIP ${jobId} completed with ${assets.length} files`);
  }

  /**
   * Process stats flush job.
   */
  private async processStatsFlush(job: Job) {
    await this.statsService.flushEvents();
    await this.statsService.aggregateDailyStats();

    await this.updateJobStatus(job.data.jobId, 'completed', 100);
    this.logger.log('Stats flush completed');
  }

  /**
   * Process similarity scan job.
   * The actual scan is performed by the Python worker.
   * This just marks the job as waiting for the Python worker.
   */
  private async processSimilarityScan(job: Job) {
    // The Python worker will pick up this job from the database
    // and process it independently
    this.logger.log(`Similarity scan job ${job.data.jobId} is waiting for Python worker`);
  }

  // ---- Helper methods ----

  private async updateJobStatus(
    jobId: string,
    status: string,
    progress: number,
    errorMessage?: string,
  ) {
    const data: any = { status, progress };
    if (errorMessage) data.errorMessage = errorMessage;
    if (status === 'completed') data.completedAt = new Date();

    await this.prisma.batchJob.update({
      where: { id: jobId },
      data,
    });
  }

  private async ensureDir(dir: string) {
    const absPath = this.storageService.getAbsolutePathForKey(dir);
    try {
      await fs.mkdir(absPath, { recursive: true });
    } catch {
      // Directory already exists
    }
  }
}
