import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private schemaInitialized = false;

  async onModuleInit() {
    await this.$connect();
    await this.ensureSchemaInitialized();
    console.log('✅ Prisma connected to MySQL');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('🔌 Prisma disconnected from MySQL');
  }

  private async ensureSchemaInitialized() {
    if (this.schemaInitialized) {
      return;
    }

    const rows = await this.$queryRawUnsafe<
      Array<{ count: bigint | number | string }>
    >(
      `SELECT COUNT(*) AS count
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND table_type = 'BASE TABLE'`
    );

    const tableCount = Number(rows?.[0]?.count ?? 0);
    if (tableCount > 0) {
      this.schemaInitialized = true;
      return;
    }

    if (process.env.AUTO_INIT_DB !== 'true') {
      throw new Error(
        'ImageHub database has no tables. Initialize it once with npm run db:push, then run the API with a least-privilege DATABASE_URL. Set AUTO_INIT_DB=true only for trusted first-run environments.'
      );
    }

    const apiDir = this.resolveApiDir();
    const prismaBin = this.resolvePrismaBin(apiDir);
    const env = { ...process.env };
    if (process.env.MIGRATION_DATABASE_URL) {
      env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
    }

    console.log('🧱 Empty database detected, running Prisma db push...');
    execFileSync(
      prismaBin,
      ['db', 'push', '--skip-generate', '--schema', 'prisma/schema.prisma'],
      {
        cwd: apiDir,
        stdio: 'inherit',
        env,
      }
    );
    console.log('✅ Prisma schema initialized');
    this.schemaInitialized = true;
  }

  private resolveApiDir() {
    const cwd = process.cwd();
    if (existsSync(resolve(cwd, 'prisma/schema.prisma'))) {
      return cwd;
    }

    const apiDir = resolve(cwd, 'apps/api');
    if (existsSync(resolve(apiDir, 'prisma/schema.prisma'))) {
      return apiDir;
    }

    throw new Error(
      `Cannot locate Prisma schema. Checked ${resolve(cwd, 'prisma/schema.prisma')} and ${resolve(apiDir, 'prisma/schema.prisma')}`
    );
  }

  private resolvePrismaBin(apiDir: string) {
    const candidates = [
      resolve(apiDir, '../../node_modules/.bin/prisma'),
      resolve(apiDir, 'node_modules/.bin/prisma'),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    throw new Error(
      `Cannot find Prisma CLI binary. Checked: ${candidates.join(', ')}`
    );
  }
}
