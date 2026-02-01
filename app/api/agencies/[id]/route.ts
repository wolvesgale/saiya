import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { auditLog } from '@/lib/audit';
import { hashPassword } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const prisma = getPrisma();
  const { user, response } = await requireSession(request);
  if (response) return response;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const agency = await prisma.agency.findUnique({ where: { id: params.id } });
  if (!agency) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (user.role !== 'SUPER_ADMIN' && agency.tenantId !== user.tenantId) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  if (user.role === 'AGENT' && agency.id !== user.agencyId) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(agency);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const payload = await request.json();
    const agency = await prisma.agency.findUnique({ where: { id: params.id } });
    if (!agency) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && agency.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const updateData: {
      name: string;
      email?: string | null;
      brandName?: string | null;
      passwordHash?: string;
      isActive: boolean;
    } = {
      name: payload.name ?? agency.name,
      email: payload.email ?? agency.email,
      brandName: payload.brandName ?? agency.brandName,
      isActive: payload.isActive ?? agency.isActive,
    };

    if (payload.password) {
      updateData.passwordHash = await hashPassword(payload.password.toString());
    }

    const updated = await prisma.agency.update({
      where: { id: params.id },
      data: updateData,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const agency = await prisma.agency.findUnique({ where: { id: params.id } });
    if (!agency) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && agency.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    await prisma.agency.delete({ where: { id: params.id } });
    auditLog('agency.deleted', { agencyId: params.id, userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
