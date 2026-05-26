import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

interface CacheEntry {
  token: any;
  expiresAt: number;
}

@Injectable()
export class AuthService {
  private tokenCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 分钟

  constructor(private prisma: PrismaService) {}

  private cacheGet(rawToken: string): any | undefined {
    const entry = this.tokenCache.get(rawToken);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.tokenCache.delete(rawToken);
      return undefined;
    }
    return entry.token;
  }

  private cacheSet(rawToken: string, token: any) {
    // 限制缓存大小，防止内存泄漏
    if (this.tokenCache.size >= 1000) {
      const firstKey = this.tokenCache.keys().next().value;
      if (firstKey) this.tokenCache.delete(firstKey);
    }
    this.tokenCache.set(rawToken, {
      token,
      expiresAt: Date.now() + this.CACHE_TTL,
    });
  }

  private cacheDelete(rawToken: string) {
    this.tokenCache.delete(rawToken);
  }

  private cacheDeleteByTokenId(tokenId: string) {
    for (const [rawToken, entry] of this.tokenCache.entries()) {
      if (entry.token?.id === tokenId) {
        this.tokenCache.delete(rawToken);
      }
    }
  }

  async hashToken(rawToken: string): Promise<string> {
    return bcrypt.hash(rawToken, 12);
  }

  getTokenPrefix(rawToken: string): string {
    return rawToken.trim().substring(0, 8);
  }

  async verifyToken(rawToken: string, hash: string): Promise<boolean> {
    return bcrypt.compare(rawToken, hash);
  }

  async createToken(params: {
    name: string;
    role: 'visitor' | 'admin';
    expiresAt?: Date;
    rawToken?: string;
  }): Promise<{ id: string; rawToken: string; tokenPrefix: string }> {
    let rawToken: string;
    if (params.rawToken && params.role === 'visitor') {
      rawToken = params.rawToken;
    } else {
      rawToken = crypto.randomBytes(32).toString('hex');
    }

    const tokenHash = await this.hashToken(rawToken);
    const tokenPrefix = this.getTokenPrefix(rawToken);

    const token = await this.prisma.accessToken.create({
      data: {
        name: params.name,
        tokenHash,
        tokenPrefix,
        role: params.role,
        expiresAt: params.expiresAt,
      },
    });

    return {
      id: token.id,
      rawToken,
      tokenPrefix,
    };
  }

  async validateToken(rawToken: string) {
    for (const tokenInput of this.getTokenInputs(rawToken)) {
      // 先查缓存
      const cached = this.cacheGet(tokenInput);
      if (cached) {
        if (!cached.enabled) {
          this.cacheDelete(tokenInput);
          return null;
        }
        // 仍检查过期时间（缓存中存的是当时的状态）
        if (cached.expiresAt && new Date(cached.expiresAt) < new Date()) {
          this.cacheDelete(tokenInput);
          return null;
        }
        // 异步更新 lastUsedAt
        this.prisma.accessToken
          .update({
            where: { id: cached.id },
            data: { lastUsedAt: new Date() },
          })
          .catch(() => {});
        return cached;
      }

      // 缓存未命中，走 bcrypt 验证
      const prefix = this.getTokenPrefix(tokenInput);
      const candidates = await this.prisma.accessToken.findMany({
        where: { tokenPrefix: prefix },
      });

      for (const candidate of candidates) {
        const isValid = await this.verifyToken(tokenInput, candidate.tokenHash);
        if (isValid) {
          if (!candidate.enabled) return null;
          if (candidate.expiresAt && candidate.expiresAt < new Date()) return null;

          // 缓存验证结果
          this.cacheSet(tokenInput, candidate);

          this.prisma.accessToken
            .update({
              where: { id: candidate.id },
              data: { lastUsedAt: new Date() },
            })
            .catch(() => {});

          return candidate;
        }
      }
    }

    return null;
  }

  private getTokenInputs(rawToken: string): string[] {
    const trimmed = rawToken.trim();
    const inputs = new Set<string>();
    if (trimmed) inputs.add(trimmed);

    // `npm run db:seed` prints helper labels around generated 64-hex tokens.
    // Accepting the embedded token makes copy/paste of the full line harmless.
    const generatedToken = trimmed.match(/[a-fA-F0-9]{64}/)?.[0];
    if (generatedToken) inputs.add(generatedToken);

    return Array.from(inputs);
  }

  async rotateToken(
    tokenId: string,
  ): Promise<{ id: string; rawToken: string; tokenPrefix: string } | null> {
    const token = await this.prisma.accessToken.findUnique({
      where: { id: tokenId },
    });

    if (!token) return null;
    this.cacheDeleteByTokenId(tokenId);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await this.hashToken(rawToken);
    const tokenPrefix = this.getTokenPrefix(rawToken);

    await this.prisma.accessToken.update({
      where: { id: tokenId },
      data: { tokenHash, tokenPrefix },
    });

    return {
      id: token.id,
      rawToken,
      tokenPrefix,
    };
  }

  async listTokens() {
    return this.prisma.accessToken.findMany({
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        role: true,
        enabled: true,
        rotatedFromTokenId: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateToken(
    tokenId: string,
    data: { name?: string; enabled?: boolean; expiresAt?: Date | null },
  ) {
    const token = await this.prisma.accessToken.findUnique({
      where: { id: tokenId },
      select: { role: true },
    });
    if (!token) throw new NotFoundException('密钥不存在');

    if (data.enabled === false && token.role === 'admin') {
      const enabledAdminCount = await this.prisma.accessToken.count({
        where: { role: 'admin', enabled: true },
      });
      if (enabledAdminCount <= 1) {
        throw new BadRequestException('不能禁用最后一个管理员密钥');
      }
    }

    return this.prisma.accessToken.update({
      where: { id: tokenId },
      data,
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        role: true,
        enabled: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }).finally(() => this.cacheDeleteByTokenId(tokenId));
  }

  async deleteToken(tokenId: string) {
    const token = await this.prisma.accessToken.findUnique({
      where: { id: tokenId },
      select: { role: true, enabled: true },
    });

    if (!token) throw new NotFoundException('密钥不存在');

    if (token.role === 'admin' && token.enabled) {
      const enabledAdminCount = await this.prisma.accessToken.count({
        where: { role: 'admin', enabled: true },
      });
      if (enabledAdminCount <= 1) {
        throw new BadRequestException('不能删除最后一个管理员密钥');
      }
    }

    return this.prisma.accessToken.delete({
      where: { id: tokenId },
    }).finally(() => this.cacheDeleteByTokenId(tokenId));
  }

  async getToken(tokenId: string) {
    return this.prisma.accessToken.findUnique({
      where: { id: tokenId },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        role: true,
        enabled: true,
        rotatedFromTokenId: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
