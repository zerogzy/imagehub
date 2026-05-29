import { Controller, Get, Param, Res } from '@nestjs/common';
import { StorageService } from './storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { FastifyReply } from 'fastify';

/**
 * Serves media files from storage.
 * Does NOT expose raw file paths to the client.
 */
@Controller('storage')
export class StorageController {
  constructor(
    private storageService: StorageService,
    private prisma: PrismaService,
  ) {}

  /**
   * Serve a derivative image (thumbnail, preview, etc.)
   * These are lower-risk and can be served more freely.
   */
  @Get('derivatives/:year/:month/:day/:filename')
  async serveDerivative(
    @Param('year') year: string,
    @Param('month') month: string,
    @Param('day') day: string,
    @Param('filename') filename: string,
    @Res() res: FastifyReply,
  ) {
    const storageKey = `preview/${year}/${month}/${day}/${filename}`;
    await this.serveFile(storageKey, res);
  }

  /**
   * Serve an original file.
   *
   * 原图直链保护: 图片类原图禁止直接访问 (返回 403)，迫使下载只能走
   * 一次性下载 token (/download/token → /download/temp/:token)。
   * 详情页改用 large 派生图展示，DOM 中不再出现原图 URL。
   * GIF / 视频 / 音频仍放行——它们的动画播放依赖原始文件，且不在保护范围内。
   */
  @Get('originals/:year/:month/:day/:filename')
  async serveOriginal(
    @Param('year') year: string,
    @Param('month') month: string,
    @Param('day') day: string,
    @Param('filename') filename: string,
    @Res() res: FastifyReply,
  ) {
    const storageKey = `original/${year}/${month}/${day}/${filename}`;

    const asset = await this.prisma.mediaAsset.findFirst({
      where: { storageKey },
      select: { mediaType: true, status: true },
    });

    if (!asset || asset.status === 'trashed') {
      res.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
      return;
    }

    if (asset.mediaType === 'image') {
      res.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: '原图禁止直接访问，请通过下载按钮获取' },
      });
      return;
    }

    await this.serveFile(storageKey, res);
  }

  private async serveFile(storageKey: string, res: FastifyReply) {
    const exists = await this.storageService.exists(storageKey);
    if (!exists) {
      res.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
      return;
    }

    const stream = this.storageService.getStream(storageKey);
    const stats = await this.storageService.getStats(storageKey);

    // Determine content type from extension
    const ext = storageKey.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      avif: 'image/avif',
      gif: 'image/gif',
      mp4: 'video/mp4',
      mp3: 'audio/mpeg',
      json: 'application/json',
    };

    const contentType = contentTypes[ext || ''] || 'application/octet-stream';

    res.header('Content-Type', contentType);
    res.header('Content-Length', stats.size.toString());
    res.header('Cache-Control', 'public, max-age=86400');

    res.send(stream);
  }
}
