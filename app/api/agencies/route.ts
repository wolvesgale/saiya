import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { user, response } = await requireSession();
  if (response) return response;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const tenantId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('tenantId') ?? undefined : user.tenantId ?? undefined;

  const agencies = await prisma.agency.findMany({
    where: tenantId ? { tenantId } : {},
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(agencies);
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireSession();
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const payload = await request.json();
    const tenantId = user.role === 'SUPER_ADMIN' ? payload.tenantId ?? user.tenantId : user.tenantId;
    if (!tenantId) {
      return NextResponse.json({ message: 'Tenant required' }, { status: 400 });
    }

    const agency = await prisma.agency.create({
      data: {
        tenantId,
        name: payload.name,
        color: payload.color ?? null,
      },
    });

    return NextResponse.json(agency, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
