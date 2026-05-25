import { Controller, Post, Get, Param, UseGuards, Request } from '@nestjs/common';
import { BackupService } from './backup.service';
import { TokenGuard } from '../auth/token.guard';
import { AdminGuard } from '../auth/admin.guard';
import { FastifyRequest } from 'fastify';

@Controller('admin/backup')
@UseGuards(TokenGuard, AdminGuard)
export class BackupController {
  constructor(private backupService: BackupService) {}

  @Post('export')
  async createBackup(@Request() req: FastifyRequest) {
    const tokenId = (req as any).token.id;
    const job = await this.backupService.createBackupJob(tokenId);
    return { success: true, data: { jobId: job.id, status: job.status } };
  }

  @Get(':jobId')
  async getBackupStatus(@Param('jobId') jobId: string) {
    const job = await this.backupService.getBackupStatus(jobId);
    if (!job) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Backup job not found' } };
    }
    return { success: true, data: job };
  }
}
