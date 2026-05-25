import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { TrashService } from './trash.service';
import { TokenGuard } from '../auth/token.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('admin/trash')
@UseGuards(TokenGuard, AdminGuard)
export class TrashController {
  constructor(private trashService: TrashService) {}

  @Get()
  async listTrashed(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.trashService.listTrashed({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return { success: true, ...result };
  }

  @Post('restore')
  async restore(@Body() body: { assetId?: string; assetIds?: string[] }) {
    if (body.assetIds && body.assetIds.length > 0) {
      const results = await this.trashService.batchRestore(body.assetIds);
      return { success: true, data: results };
    }
    if (body.assetId) {
      const result = await this.trashService.restore(body.assetId);
      if (!result) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Item not found in trash' } };
      }
      return result;
    }
    return { success: false, error: { code: 'MISSING_ID', message: 'assetId or assetIds required' } };
  }

  @Post('purge')
  async purge(@Body() body: { assetId?: string; assetIds?: string[] }) {
    if (body.assetIds && body.assetIds.length > 0) {
      const results = await this.trashService.batchPurge(body.assetIds);
      return { success: true, data: results };
    }
    if (body.assetId) {
      const result = await this.trashService.purge(body.assetId);
      if (!result) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Item not found in trash' } };
      }
      return result;
    }
    return { success: false, error: { code: 'MISSING_ID', message: 'assetId or assetIds required' } };
  }
}
