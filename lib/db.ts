import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function normalizePrismaEnv() {
  const pick = (...values: Array<string | undefined>) => values.find((value) => value && value.length > 0);

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.length === 0) {
    process.env.DATABASE_URL = pick(
      process.env.POSTGRES_PRISMA_URL,
      process.env.POSTGRES_URL,
      process.env.POSTGRES_URL_NON_POOLING,
      process.env.SUPABASE_DATABASE_URL,
    );
  }

  if (!process.env.DIRECT_URL || process.env.DIRECT_URL.length === 0) {
    process.env.DIRECT_URL = pick(
      process.env.POSTGRES_URL_NON_POOLING,
      process.env.POSTGRES_PRISMA_URL,
      process.env.DATABASE_URL,
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL (set DATABASE_URL or POSTGRES_PRISMA_URL/POSTGRES_URL).');
  }

  if (!process.env.DIRECT_URL) {
    throw new Error('Missing DIRECT_URL (set DIRECT_URL or POSTGRES_URL_NON_POOLING).');
  }
}

export function getPrisma() {
  normalizePrismaEnv();
  const databaseUrl = process.env.DATABASE_URL;

  if (!globalThis.__prisma) {
    globalThis.__prisma = new PrismaClient({
      ...(databaseUrl
        ? {
            datasources: {
              db: {
                url: databaseUrl,
              },
            },
          }
        : {}),
      log: ['error', 'warn'],
    });
  }
  return globalThis.__prisma;
}
