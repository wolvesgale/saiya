import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { hashPassword } from '@/lib/auth';
import { auditLog } from '@/lib/audit';

function generateTempPassword() {
  return Math.random().toString(36).slice(2, 10);
}

export async function GET(request: Request) {
  const { user, response } = await requireSession();
  if (response) return response;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const tenantId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('tenantId') ?? undefined : user.tenantId ?? undefined;

  const users = await prisma.user.findMany({
    where: tenantId ? { tenantId } : {},
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, role: true, isActive: true, tenantId: true, agencyId: true },
  });
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireSession();
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const payload = await request.json();
    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const tenantId = user.role === 'SUPER_ADMIN' ? payload.tenantId ?? user.tenantId : user.tenantId;
    if (!tenantId) {
      return NextResponse.json({ message: 'Tenant required' }, { status: 400 });
    }

    const created = await prisma.user.create({
      data: {
        email: payload.email,
        passwordHash,
        role: payload.role,
        isActive: true,
        mustChangePassword: true,
        tenantId,
        agencyId: payload.agencyId ?? null,
      },
    });

    auditLog('user.created', { userId: created.id, createdBy: user.id });

    return NextResponse.json({ id: created.id, tempPassword });
  } catch (error) {
    return errorResponse(error);
  }
}
