import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const databaseUrl =
  process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.SUPABASE_DATABASE_URL;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
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

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
