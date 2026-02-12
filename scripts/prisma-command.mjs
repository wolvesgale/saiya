#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/prisma-command.mjs <prisma args...>');
  process.exit(1);
}

const env = { ...process.env };
const pick = (...values) => values.find((value) => typeof value === 'string' && value.length > 0);

const poolUrl = pick(env.POSTGRES_PRISMA_URL, env.DATABASE_URL, env.POSTGRES_URL);
const directUrl = pick(env.POSTGRES_URL_NON_POOLING, env.DIRECT_URL, poolUrl);

if (poolUrl) {
  env.POSTGRES_PRISMA_URL = poolUrl;
}

if (directUrl) {
  env.POSTGRES_URL_NON_POOLING = directUrl;
}

if (!env.POSTGRES_PRISMA_URL) {
  console.error('[prisma-env] Missing POSTGRES_PRISMA_URL (or DATABASE_URL fallback).');
  process.exit(1);
}

if (!env.POSTGRES_URL_NON_POOLING) {
  console.error('[prisma-env] Missing POSTGRES_URL_NON_POOLING (or DIRECT_URL fallback).');
  process.exit(1);
}

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(cmd, ['prisma', ...args], { stdio: 'inherit', env });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
