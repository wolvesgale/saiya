// app/api/auth/change-password/route.ts
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireSession, errorResponse } from '@/lib/api';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const payload = await request.json().catch(() => ({}));
    const currentPassword = (payload.currentPassword ?? '').toString();
    const newPassword = (payload.newPassword ?? '').toString();

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ message: 'New password is too short' }, { status: 400 });
    }

    // AGENCY の場合
    if (user.principalType === 'AGENCY') {
      const agency = await prisma.agency.findUnique({ where: { id: user.id } });
      if (!agency || !agency.passwordHash) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

      if (currentPassword) {
        const ok = await verifyPassword(currentPassword, agency.passwordHash);
        if (!ok) return NextResponse.json({ message: 'Invalid current password' }, { status: 400 });
      }

      const passwordHash = await hashPassword(newPassword);
      await prisma.agency.update({
        where: { id: agency.id },
        data: { passwordHash },
      });

      auditLog('agency.password_changed', { agencyId: agency.id, changedBy: user.id });

      return NextResponse.json({ ok: true });
    }

    // USER の場合
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser || !dbUser.passwordHash || !dbUser.isActive) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (currentPassword) {
      const ok = await verifyPassword(currentPassword, dbUser.passwordHash);
      if (!ok) return NextResponse.json({ message: 'Invalid current password' }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { passwordHash, mustChangePassword: false },
    });

    auditLog('user.password_changed', { userId: dbUser.id, changedBy: user.id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
