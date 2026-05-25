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
    const data = await (req as any).file();
    if (!data) {
      return {
        success: false,
        error: { code: 'NO_FILE', message: 'No file uploaded' },
      };
    }

    const buffer = await data.toBuffer();
    const tokenId = (req as any).token.id;

    const result = await this.uploadService.processUploadedFile({
      file: {
        fieldname: data.fieldname,
        originalname: data.filename,
        encoding: data.encoding,
        mimetype: data.mimetype,
        buffer,
        size: buffer.length,
      },
      tokenId,
    });

    return { success: true, data: result };
  }

  /**
   * Batch upload - accepts multiple files.
   */
  @Post('batch')
  async uploadBatch(@Request() req: FastifyRequest) {
    const parts = (req as any).files();
    const results = [];
    const tokenId = (req as any).token.id;

    for await (const data of parts) {
      const buffer = await data.toBuffer();
      const result = await this.uploadService.processUploadedFile({
        file: {
          fieldname: data.fieldname,
          originalname: data.filename,
          encoding: data.encoding,
          mimetype: data.mimetype,
          buffer,
          size: buffer.length,
        },
        tokenId,
      });
      results.push(result);
    }

    return { success: true, data: results };
  }
}
