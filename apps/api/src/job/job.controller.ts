import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JobService } from './job.service';
import { TokenGuard } from '../auth/token.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('admin/jobs')
@UseGuards(TokenGuard, AdminGuard)
export class JobController {
  constructor(private jobService: JobService) {}

  @Get()
  async listJobs(
    @Query('jobType') jobType?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.jobService.listJobs({
      jobType,
      status,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  async getJob(@Param('id') id: string) {
    const job = await this.jobService.getJob(id);
    if (!job) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Job not found' } };
    }
    return { success: true, data: job };
  }

  @Post(':id/retry')
  async retryJob(@Param('id') id: string) {
    const job = await this.jobService.retryJob(id);
    return { success: true, data: job };
  }
}
