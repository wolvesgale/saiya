#!/usr/bin/env node
const pick = (...values) => values.find((value) => typeof value === 'string' && value.length > 0);
const errors = [];
const warnings = [];

const poolUrl = pick(process.env.POSTGRES_PRISMA_URL, process.env.DATABASE_URL, process.env.POSTGRES_URL);
const directUrl = pick(process.env.POSTGRES_URL_NON_POOLING, process.env.DIRECT_URL, poolUrl);

if (!process.env.POSTGRES_PRISMA_URL) {
  errors.push('POSTGRES_PRISMA_URL is missing. Set a Supabase pooler (port 6543) URL with pgbouncer=true.');
}

if (!process.env.POSTGRES_URL_NON_POOLING) {
  warnings.push('POSTGRES_URL_NON_POOLING is missing. Prisma migrate will fallback to POSTGRES_PRISMA_URL, but direct URL (port 5432) is recommended.');
}

if (process.env.POSTGRES_URL) {
  warnings.push('POSTGRES_URL is deprecated in this project. Prefer POSTGRES_PRISMA_URL only.');
}

if (poolUrl) {
  try {
    const url = new URL(poolUrl);
    if (url.port === '6543' && url.searchParams.get('pgbouncer') !== 'true') {
      warnings.push('POSTGRES_PRISMA_URL should include pgbouncer=true when using port 6543.');
    }
  } catch {
    warnings.push('POSTGRES_PRISMA_URL format could not be parsed as URL.');
  }
}

if (directUrl) {
  try {
    const url = new URL(directUrl);
    if (url.port !== '5432') {
      warnings.push('POSTGRES_URL_NON_POOLING should usually use port 5432 (direct connection).');
    }
  } catch {
    warnings.push('POSTGRES_URL_NON_POOLING format could not be parsed as URL.');
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(`❌ ${message}`);
  }
  for (const message of warnings) {
    console.warn(`⚠️ ${message}`);
  }
  process.exit(1);
}

for (const message of warnings) {
  console.warn(`⚠️ ${message}`);
}

console.info('✅ Environment variable check passed for Prisma/Supabase settings.');
