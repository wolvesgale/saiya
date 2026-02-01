import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const prisma = getPrisma();
    const dbInfoRows = await prisma.$queryRaw<
      Array<{
        current_database: string;
        inet_server_addr: string | null;
        inet_server_port: number | null;
        current_user: string;
        version: string;
      }>
    >`SELECT current_database() as current_database,
        inet_server_addr() as inet_server_addr,
        inet_server_port() as inet_server_port,
        current_user as current_user,
        version() as version`;

    let latestMigration: { migration_name: string; finished_at: Date | null } | null = null;
    try {
      const migrationRows = await prisma.$queryRaw<
        Array<{ migration_name: string; finished_at: Date | null }>
      >`SELECT migration_name, finished_at
        FROM _prisma_migrations
        ORDER BY finished_at DESC NULLS LAST
        LIMIT 1`;
      latestMigration = migrationRows[0] ?? null;
    } catch (migrationError) {
      console.warn('[health.db] _prisma_migrations unavailable', migrationError);
    }

    return NextResponse.json({
      ok: true,
      connection: dbInfoRows[0] ?? null,
      latestMigration,
    });
  } catch (error) {
    console.error('[health.db] error', error);
    return errorResponse(error);
  }
}
