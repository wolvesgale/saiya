import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[health.db] error', error);
    return errorResponse(error);
  }
}
