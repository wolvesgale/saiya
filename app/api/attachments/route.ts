import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireSession, errorResponse } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const url = new URL(request.url);
    const tenantId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('tenantId') ?? undefined : user.tenantId ?? undefined;

    const attachments = await prisma.attachment.findMany({
      where: tenantId ? { tenantId, deletedAt: null } : { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(attachments);
  } catch (error) {
    return errorResponse(error);
  }
}
