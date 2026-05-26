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

async function main() {
  console.log('🌱 Seeding database...');

  // Create initial admin token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(rawToken, 12);
  const tokenPrefix = rawToken.substring(0, 8);

  const adminToken = await prisma.accessToken.create({
    data: {
      name: 'Initial Admin Token',
      tokenHash,
      tokenPrefix,
      role: 'admin',
      enabled: true,
    },
  });

  console.log('');
  console.log('✅ Admin token created successfully!');
  console.log('');
  console.log('⚠️  SAVE THIS TOKEN NOW - IT WILL NOT BE SHOWN AGAIN:');
  console.log(`🔑 ${rawToken}`);
  console.log(`ADMIN_TOKEN=${rawToken}`);
  console.log(`📌 Prefix: ${tokenPrefix}`);
  console.log('');

  // Create a visitor token
  const visitorRawToken = crypto.randomBytes(32).toString('hex');
  const visitorTokenHash = await bcrypt.hash(visitorRawToken, 12);
  const visitorTokenPrefix = visitorRawToken.substring(0, 8);

  const visitorToken = await prisma.accessToken.create({
    data: {
      name: 'Default Visitor Token',
      tokenHash: visitorTokenHash,
      tokenPrefix: visitorTokenPrefix,
      role: 'visitor',
      enabled: true,
    },
  });

  console.log('✅ Visitor token created:');
  console.log(`🔑 ${visitorRawToken}`);
  console.log(`VISITOR_TOKEN=${visitorRawToken}`);
  console.log(`📌 Prefix: ${visitorTokenPrefix}`);
  console.log('');

  // Create a sample group
  const group = await prisma.group.create({
    data: {
      name: '示例分组',
      slug: 'demo',
      description: '这是一个示例分组',
      rankKey: '1',
      randomEnabled: true,
      randomRotateInterval: 60,
    },
  });

  console.log(`✅ Sample group created: ${group.name}`);
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
