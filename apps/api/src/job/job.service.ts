import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JobService {
  constructor(private prisma: PrismaService) {}

  /**
   * List all jobs.
   */
  async listJobs(params: { jobType?: string; status?: string; page?: number; pageSize?: number }) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const where: any = {};
    if (params.jobType) where.jobType = params.jobType;
    if (params.status) where.status = params.status;

    const [jobs, total] = await Promise.all([
      this.prisma.batchJob.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.batchJob.count({ where }),
    ]);

    return {
      jobs,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  /**
   * Get a single job.
   */
  async getJob(jobId: string) {
    return this.prisma.batchJob.findUnique({
      where: { id: jobId },
    });
  }

  /**
   * Retry a failed job.
   */
  async retryJob(jobId: string) {
    return this.prisma.batchJob.update({
      where: { id: jobId },
      data: { status: 'pending', progress: 0, errorMessage: null },
    });
  }
}
