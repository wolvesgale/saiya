import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const databaseUrl =
  process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.SUPABASE_DATABASE_URL;

export function getPrisma() {
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
