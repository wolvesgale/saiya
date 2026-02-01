import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { hashPassword } from '@/lib/auth';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';

function generateTempPassword() {
  return Math.random().toString(36).slice(2, 10);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, response } = await requireSession();
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && target.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    await prisma.user.update({
      where: { id: params.id },
      data: { passwordHash, mustChangePassword: true },
    });

    auditLog('user.password_reset', { userId: params.id, resetBy: user.id });

    return NextResponse.json({ tempPassword });
  } catch (error) {
    return errorResponse(error);
  }
}
