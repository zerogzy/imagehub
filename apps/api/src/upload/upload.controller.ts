import {
  Controller,
  Post,
  UseGuards,
  Request,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UploadService } from './upload.service';
import { TokenGuard } from '../auth/token.guard';
import { AdminGuard } from '../auth/admin.guard';
import { FastifyRequest } from 'fastify';

@Controller('admin/upload')
@UseGuards(TokenGuard, AdminGuard)
export class UploadController {
  constructor(private uploadService: UploadService) {}

  /**
   * Upload a single file.
   * Uses multipart/form-data.
   */
  @Post()
  async uploadFile(@Request() req: FastifyRequest) {
    const parts = (req as any).parts();
    let uploadedFile: any = null;
    let groupId: string | undefined;
    let subgroupId: string | undefined;

    for await (const part of parts) {
      if (part.type === 'file' && !uploadedFile) {
        const buffer = await part.toBuffer();
        uploadedFile = {
          fieldname: part.fieldname,
          originalname: part.filename,
          encoding: part.encoding,
          mimetype: part.mimetype,
          buffer,
          size: buffer.length,
        };
        continue;
      }

      if (part.type === 'field') {
        if (part.fieldname === 'groupId') groupId = String(part.value || '') || undefined;
        if (part.fieldname === 'subgroupId') {
          subgroupId = String(part.value || '') || undefined;
        }
      }
    }

    if (!uploadedFile) {
      return {
        success: false,
        error: { code: 'NO_FILE', message: 'No file uploaded' },
      };
    }

    const tokenId = (req as any).token.id;

    const result = await this.uploadService.processUploadedFile({
      file: uploadedFile,
      groupId,
      subgroupId,
      tokenId,
    });

    return { success: true, data: result };
  }

  /**
   * Batch upload - accepts multiple files.
   */
  @Post('batch')
  async uploadBatch(@Request() req: FastifyRequest) {
    const parts = (req as any).parts();
    const results = [];
    const tokenId = (req as any).token.id;
    const files = [];
    let groupId: string | undefined;
    let subgroupId: string | undefined;

    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'groupId') groupId = String(part.value || '') || undefined;
        if (part.fieldname === 'subgroupId') {
          subgroupId = String(part.value || '') || undefined;
        }
        continue;
      }

      if (part.type !== 'file') continue;
      const buffer = await part.toBuffer();
      files.push({
        fieldname: part.fieldname,
        originalname: part.filename,
        encoding: part.encoding,
        mimetype: part.mimetype,
        buffer,
        size: buffer.length,
      });
    }

    for (const file of files) {
      const result = await this.uploadService.processUploadedFile({
        file,
        groupId,
        subgroupId,
        tokenId,
      });
      results.push(result);
    }

    return { success: true, data: results };
  }
}
