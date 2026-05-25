import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

/**
 * StorageProvider interface for file operations.
 * Currently implements LocalStorageProvider.
 * Future: S3StorageProvider can be added as an alternative.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly storageRoot: string;

  constructor(private configService: ConfigService) {
    this.storageRoot = path.resolve(
      this.configService.get('STORAGE_ROOT', './storage'),
    );
    this.ensureDirectories();
  }

  /**
   * Ensure all storage directories exist.
   */
  private async ensureDirectories() {
    const dirs = [
      'original',
      'preview',
      'video',
      'audio',
      'exports/backup',
      'exports/batch-download',
      'temp/upload',
      'temp/zip',
    ];

    for (const dir of dirs) {
      const fullPath = path.join(this.storageRoot, dir);
      try {
        await fs.mkdir(fullPath, { recursive: true });
      } catch {
        // Directory already exists, ignore
      }
    }
  }

  /**
   * Generate a storage key for a file.
   * Format: {type}/{year}/{month}/{day}/{assetId}_{suffix}.{ext}
   */
  generateStorageKey(params: {
    type: 'original' | 'preview' | 'video' | 'audio' | 'exports' | 'temp';
    assetId: string;
    suffix: string;
    extension: string;
    date?: Date;
  }): string {
    const date = params.date || new Date();
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    return `${params.type}/${year}/${month}/${day}/${params.assetId}_${params.suffix}.${params.extension}`;
  }

  /**
   * Get the absolute file path from a storage key.
   */
  private getAbsolutePath(storageKey: string): string {
    const resolved = path.resolve(this.storageRoot, storageKey);
    // Prevent path traversal
    if (!resolved.startsWith(this.storageRoot)) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  /**
   * Save a file from a buffer to storage.
   */
  async save(storageKey: string, buffer: Buffer): Promise<void> {
    const absPath = this.getAbsolutePath(storageKey);
    const dir = path.dirname(absPath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(absPath, buffer);
  }

  /**
   * Save a file from a stream to storage.
   */
  async saveFromStream(storageKey: string, stream: Readable): Promise<void> {
    const absPath = this.getAbsolutePath(storageKey);
    const dir = path.dirname(absPath);

    await fs.mkdir(dir, { recursive: true });
    const writeStream = createWriteStream(absPath);
    await pipeline(stream, writeStream);
  }

  /**
   * Read a file from storage as a buffer.
   */
  async read(storageKey: string): Promise<Buffer> {
    const absPath = this.getAbsolutePath(storageKey);
    return fs.readFile(absPath);
  }

  /**
   * Delete a file from storage.
   */
  async delete(storageKey: string): Promise<void> {
    const absPath = this.getAbsolutePath(storageKey);
    try {
      await fs.unlink(absPath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, that's fine
    }
  }

  /**
   * Check if a file exists in storage.
   */
  async exists(storageKey: string): Promise<boolean> {
    const absPath = this.getAbsolutePath(storageKey);
    try {
      await fs.access(absPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a readable stream for a file.
   */
  getStream(storageKey: string): NodeJS.ReadableStream {
    const absPath = this.getAbsolutePath(storageKey);
    return createReadStream(absPath);
  }

  /**
   * Get the absolute path for serving files.
   * Used by Fastify static file serving.
   */
  getAbsolutePathForKey(storageKey: string): string {
    return this.getAbsolutePath(storageKey);
  }

  /**
   * Get file stats (size, etc).
   */
  async getStats(storageKey: string) {
    const absPath = this.getAbsolutePath(storageKey);
    return fs.stat(absPath);
  }

  /**
   * Compute SHA256 hash of a file.
   */
  async computeSha256(storageKey: string): Promise<string> {
    const crypto = await import('crypto');
    const buffer = await this.read(storageKey);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Delete multiple files.
   */
  async deleteMultiple(storageKeys: string[]): Promise<void> {
    await Promise.all(storageKeys.map((key) => this.delete(key)));
  }
}
