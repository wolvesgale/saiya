import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function normalizePrismaEnv() {
  const pick = (...values: Array<string | undefined>) => values.find((value) => value && value.length > 0);
  const ensurePoolerParams = (value: string) => {
    try {
      const url = new URL(value);
      if (url.port === '6543') {
        if (!url.searchParams.has('pgbouncer')) {
          url.searchParams.set('pgbouncer', 'true');
        }
        if (!url.searchParams.has('connection_limit')) {
          url.searchParams.set('connection_limit', '1');
        }
      }
      return url.toString();
    } catch {
      return value;
    }
  };

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.length === 0) {
    process.env.DATABASE_URL = pick(
      process.env.POSTGRES_PRISMA_URL,
      process.env.POSTGRES_URL_NON_POOLING,
      process.env.SUPABASE_DATABASE_URL,
    );
    if (process.env.DATABASE_URL) {
      console.info('[db] DATABASE_URL resolved from fallback env.');
    }
  }


  if (process.env.POSTGRES_URL) {
    console.warn('[db] POSTGRES_URL is deprecated. Use POSTGRES_PRISMA_URL instead.');
  }

  if (!process.env.DIRECT_URL || process.env.DIRECT_URL.length === 0) {
    process.env.DIRECT_URL = pick(
      process.env.POSTGRES_URL_NON_POOLING,
      process.env.POSTGRES_PRISMA_URL,
      process.env.SUPABASE_DATABASE_URL,
      process.env.DATABASE_URL,
    );
    if (process.env.DIRECT_URL) {
      console.info('[db] DIRECT_URL resolved from fallback env.');
    }
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL (set DATABASE_URL or POSTGRES_PRISMA_URL).');
  }

  if (!process.env.DIRECT_URL) {
    throw new Error('Missing DIRECT_URL (set DIRECT_URL or POSTGRES_URL_NON_POOLING).');
  }

  process.env.DATABASE_URL = ensurePoolerParams(process.env.DATABASE_URL);
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

export async function resolveXruleTenantId(prisma: PrismaClient) {
  if (process.env.XRULE_TENANT_ID && process.env.XRULE_TENANT_ID.length > 0) {
    console.info('[tenant] Using XRULE_TENANT_ID from environment.');
    return process.env.XRULE_TENANT_ID;
  }

  const tenant = await prisma.tenant.findUnique({ where: { name: 'Xrule' } });
  if (!tenant) {
    throw new Error('Tenant Xrule not found. Super Admin must create the initial tenant.');
  }

  console.info('[tenant] Resolved Xrule tenant from database.');
  return tenant.id;
}
