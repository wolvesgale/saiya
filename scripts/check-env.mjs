#!/usr/bin/env node
const warnings = [];

const poolUrl = process.env.DATABASE_URL;
const directUrl = process.env.DIRECT_URL;

if (!poolUrl) {
  console.error('❌ DATABASE_URL is missing. Set Supabase pooler (port 6543) URL with pgbouncer=true.');
  process.exit(1);
}

if (!directUrl) {
  console.error('❌ DIRECT_URL is missing. Set Supabase direct URL (port 5432).');
  process.exit(1);
}

if (process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING) {
  warnings.push('Deprecated POSTGRES_* DB env keys are set. Runtime/migrate only read DATABASE_URL and DIRECT_URL.');
}

try {
  const url = new URL(poolUrl);
  if (url.port === '6543' && url.searchParams.get('pgbouncer') !== 'true') {
    warnings.push('DATABASE_URL should include pgbouncer=true when using port 6543.');
  }
} catch {
  warnings.push('DATABASE_URL format could not be parsed as URL.');
}

try {
  const url = new URL(directUrl);
  if (url.port !== '5432') {
    warnings.push('DIRECT_URL should usually use port 5432 (direct connection).');
  }
} catch {
  warnings.push('DIRECT_URL format could not be parsed as URL.');
}

for (const message of warnings) {
  console.warn(`⚠️ ${message}`);
}

console.info('✅ Environment variable check passed for Prisma/Supabase settings.');
