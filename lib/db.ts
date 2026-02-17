import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaEnvLogged: boolean | undefined;
}

function normalizePrismaEnv() {
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

  if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL. Runtime DB connection must use DATABASE_URL.');
  }

  if (!process.env.DIRECT_URL) {
    throw new Error('Missing DIRECT_URL. Prisma migrate connection must use DIRECT_URL.');
  }

  if (process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING) {
    console.warn('[db] Deprecated POSTGRES_* DB env keys detected. This runtime reads DATABASE_URL / DIRECT_URL only.');
  }

  process.env.DATABASE_URL = ensurePoolerParams(process.env.DATABASE_URL);
}

export function getPrisma() {
  normalizePrismaEnv();
  const databaseUrl = process.env.DATABASE_URL;

  if (!globalThis.__prismaEnvLogged && databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);
      console.info(`[db] Prisma runtime datasource: DATABASE_URL (${parsed.hostname}:${parsed.port || '5432'})`);
    } catch {
      console.info('[db] Prisma runtime datasource: DATABASE_URL (host/port parse failed)');
    }
    globalThis.__prismaEnvLogged = true;
  }

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
