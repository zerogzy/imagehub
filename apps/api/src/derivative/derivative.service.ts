import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MediaType, DerivativeType } from '@imagehub/shared';
import * as sharp from 'sharp';

export interface DerivativeResult {
  width: number | null;
  height: number | null;
  duration: number | null;
}

@Injectable()
export class DerivativeService {
  private readonly logger = new Logger(DerivativeService.name);

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
  ) {}

  /**
   * Process all derivatives for a media asset.
   * Returns extracted metadata.
   */
  async processDerivatives(
    assetId: string,
    originalStorageKey: string,
    mediaType: string,
    mimeType: string,
  ): Promise<DerivativeResult> {
    const result: DerivativeResult = {
      width: null,
      height: null,
      duration: null,
    };

    switch (mediaType) {
      case MediaType.IMAGE:
      case MediaType.GIF:
        return this.processImageDerivatives(assetId, originalStorageKey, mimeType);
        break;
      case MediaType.VIDEO:
        await this.processVideoDerivatives(assetId, originalStorageKey);
        break;
      case MediaType.AUDIO:
        await this.processAudioDerivatives(assetId, originalStorageKey);
        break;
    }

    return result;
  }

  /**
   * Process image derivatives: thumb, preview, large.
   */
  private async processImageDerivatives(
    assetId: string,
    originalStorageKey: string,
    mimeType: string,
  ): Promise<DerivativeResult> {
    const originalBuffer = await this.storageService.read(originalStorageKey);
    const image = sharp(originalBuffer, { animated: mimeType === 'image/gif' });
    const metadata = await image.metadata();

    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    // Thumbnail: max 300x300, cover crop
    if (originalWidth > 0 && originalHeight > 0) {
      const thumbBuffer = await sharp(originalBuffer, { animated: false })
        .resize(300, 300, { fit: 'cover', position: 'attention' })
        .webp({ quality: 75 })
        .toBuffer();

      const thumbKey = this.storageService.generateStorageKey({
        type: 'preview',
        assetId,
        suffix: 'thumb',
        extension: 'webp',
      });
      await this.storageService.save(thumbKey, thumbBuffer);
      await this.prisma.assetDerivative.create({
        data: {
          assetId,
          derivativeType: DerivativeType.THUMB,
          storageKey: thumbKey,
          width: 300,
          height: 300,
          sizeBytes: BigInt(thumbBuffer.length),
        },
      });
    }

    // Preview: max 1200x1200, inside fit
    {
      const previewBuffer = await sharp(originalBuffer, { animated: false })
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();

      const previewMeta = await sharp(previewBuffer).metadata();
      const previewKey = this.storageService.generateStorageKey({
        type: 'preview',
        assetId,
        suffix: 'preview',
        extension: 'webp',
      });
      await this.storageService.save(previewKey, previewBuffer);
      await this.prisma.assetDerivative.create({
        data: {
          assetId,
          derivativeType: DerivativeType.PREVIEW,
          storageKey: previewKey,
          width: previewMeta.width,
          height: previewMeta.height,
          sizeBytes: BigInt(previewBuffer.length),
        },
      });
    }

    // Large: max 2400x2400, inside fit
    {
      const largeBuffer = await sharp(originalBuffer, { animated: false })
        .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer();

      const largeMeta = await sharp(largeBuffer).metadata();
      const largeKey = this.storageService.generateStorageKey({
        type: 'preview',
        assetId,
        suffix: 'large',
        extension: 'webp',
      });
      await this.storageService.save(largeKey, largeBuffer);
      await this.prisma.assetDerivative.create({
        data: {
          assetId,
          derivativeType: DerivativeType.LARGE,
          storageKey: largeKey,
          width: largeMeta.width,
          height: largeMeta.height,
          sizeBytes: BigInt(largeBuffer.length),
        },
      });
    }

    this.logger.log(`Image derivatives created for asset ${assetId}`);

    return {
      width: originalWidth || null,
      height: originalHeight || null,
      duration: null,
    };
  }

  /**
   * Process video derivatives: video cover (thumbnail).
   * Note: FFmpeg is needed for video cover extraction.
   * For now, create a placeholder.
   */
  private async processVideoDerivatives(
    assetId: string,
    _originalStorageKey: string,
  ) {
    // TODO: Use FFmpeg to extract video cover
    // For now, just log that video processing is needed
    this.logger.warn(
      `Video derivative processing for asset ${assetId} requires FFmpeg. Skipping for now.`,
    );
  }

  /**
   * Process audio derivatives: waveform.
   * Note: FFmpeg is needed for waveform extraction.
   * For now, create a placeholder.
   */
  private async processAudioDerivatives(
    assetId: string,
    _originalStorageKey: string,
  ) {
    // TODO: Use FFmpeg to extract audio waveform
    this.logger.warn(
      `Audio derivative processing for asset ${assetId} requires FFmpeg. Skipping for now.`,
    );
  }
}
