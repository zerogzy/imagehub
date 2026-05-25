#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { config: loadEnv } = require('dotenv');

const envPaths = [
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), '../../.env.local'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '.env.local'),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }
}

const args = process.argv.slice(2);
const command = args.join(' ');
const needsSchemaWrite =
  command.startsWith('db push') ||
  command.startsWith('migrate dev') ||
  command.startsWith('migrate deploy');

const env = { ...process.env };
if (needsSchemaWrite && process.env.MIGRATION_DATABASE_URL) {
  env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
}

const prismaCli = require.resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [prismaCli, ...args], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
