import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { existsSync } from 'fs';
import * as path from 'path';
import { config as loadEnv } from 'dotenv';

const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), '../../.env.local'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../../.env.local'),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath });
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Put it in /opt/imagehub/.env or export it before running db scripts.');
}

const prisma = new PrismaClient();

async function createToken(params: { name: string; role: 'admin' | 'visitor' }) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(rawToken, 12);
  const tokenPrefix = rawToken.substring(0, 8);

  await prisma.accessToken.create({
    data: {
      name: params.name,
      tokenHash,
      tokenPrefix,
      role: params.role,
      enabled: true,
    },
  });

  return { rawToken, tokenPrefix };
}

async function main() {
  console.log('🌱 Seeding database...');

  // Create or update a sample group. Seed must be safe to run more than once.
  const group = await prisma.group.upsert({
    where: { slug: 'demo' },
    create: {
      name: '示例分组',
      slug: 'demo',
      description: '这是一个示例分组',
      rankKey: '1',
      randomEnabled: true,
      randomRotateInterval: 60,
    },
    update: {
      name: '示例分组',
      description: '这是一个示例分组',
      randomEnabled: true,
      randomRotateInterval: 60,
    },
  });

  await prisma.subgroup.upsert({
    where: { id: `${group.id}:default-seed-subgroup` },
    create: {
      id: `${group.id}:default-seed-subgroup`,
      groupId: group.id,
      name: '默认',
      rankKey: '1',
    },
    update: {
      name: '默认',
      rankKey: '1',
    },
  });

  console.log(`✅ Sample group ready: ${group.name}`);
  console.log('');

  const enabledAdminCount = await prisma.accessToken.count({
    where: { role: 'admin', enabled: true },
  });
  if (enabledAdminCount === 0) {
    const admin = await createToken({ name: 'Initial Admin Token', role: 'admin' });

    console.log('✅ Admin token created successfully!');
    console.log('');
    console.log('⚠️  SAVE THIS TOKEN NOW - IT WILL NOT BE SHOWN AGAIN:');
    console.log(`🔑 ${admin.rawToken}`);
    console.log(`ADMIN_TOKEN=${admin.rawToken}`);
    console.log(`📌 Prefix: ${admin.tokenPrefix}`);
    console.log('');
  } else {
    console.log(`ℹ️  Skipped admin token creation (${enabledAdminCount} enabled admin token(s) already exist).`);
    console.log('');
  }

  const enabledVisitorCount = await prisma.accessToken.count({
    where: { role: 'visitor', enabled: true },
  });
  if (enabledVisitorCount === 0) {
    const visitor = await createToken({ name: 'Default Visitor Token', role: 'visitor' });

    console.log('✅ Visitor token created:');
    console.log(`🔑 ${visitor.rawToken}`);
    console.log(`VISITOR_TOKEN=${visitor.rawToken}`);
    console.log(`📌 Prefix: ${visitor.tokenPrefix}`);
    console.log('');
  } else {
    console.log(`ℹ️  Skipped visitor token creation (${enabledVisitorCount} enabled visitor token(s) already exist).`);
    console.log('');
  }

  console.log('');
  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
