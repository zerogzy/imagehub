import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  /**
   * Log an admin action.
   */
  async log(params: {
    tokenId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    detail?: any;
  }) {
    return this.prisma.auditLog.create({
      data: {
        tokenId: params.tokenId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        detailJson: params.detail ? JSON.stringify(params.detail) : null,
      },
    });
  }

  /**
   * Query audit logs.
   */
  async query(params: {
    tokenId?: string;
    action?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const where: any = {};
    if (params.tokenId) where.tokenId = params.tokenId;
    if (params.action) where.action = params.action;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }
}
