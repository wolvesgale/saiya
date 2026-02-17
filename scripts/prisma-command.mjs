#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/prisma-command.mjs <prisma args...>');
  process.exit(1);
}

const env = { ...process.env };

if (!env.DATABASE_URL) {
  console.error('[prisma-env] Missing DATABASE_URL.');
  process.exit(1);
}

if (!env.DIRECT_URL) {
  console.error('[prisma-env] Missing DIRECT_URL.');
  process.exit(1);
}

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(cmd, ['prisma', ...args], { stdio: 'inherit', env });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
