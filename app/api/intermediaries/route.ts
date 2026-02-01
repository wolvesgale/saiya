import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const tenantId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('tenantId') ?? undefined : user.tenantId ?? undefined;

    const intermediaries = await prisma.intermediary.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(intermediaries);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const payload = await request.json();
    const tenantId = user.role === 'SUPER_ADMIN' ? payload.tenantId ?? user.tenantId : user.tenantId;
    if (!tenantId) {
      return NextResponse.json({ message: 'Tenant required' }, { status: 400 });
    }
    if (!payload.name) {
      return NextResponse.json({ message: 'Name is required' }, { status: 400 });
    }

    const intermediary = await prisma.intermediary.create({
      data: {
        tenantId,
        name: payload.name,
        reportFormUrl: payload.reportFormUrl ?? null,
      },
    });

    return NextResponse.json(intermediary, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
