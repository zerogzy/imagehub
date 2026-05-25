import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BackupService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a backup export job.
   * The job generates metadata.sql, manifest.json, checksums.txt.
   * Original files are NOT included.
   */
  async createBackupJob(tokenId: string) {
    return this.prisma.batchJob.create({
      data: {
        jobType: 'backup_export',
        status: 'pending',
        payloadJson: JSON.stringify({ includeStats: false }),
        progress: 0,
        createdByTokenId: tokenId,
      },
    });
  }

  /**
   * Get backup status.
   */
  async getBackupStatus(jobId: string) {
    return this.prisma.batchJob.findUnique({
      where: { id: jobId },
    });
  }
}
