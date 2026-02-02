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

    const body = await request.json().catch(() => ({}));
    const currentPassword = (body.currentPassword ?? '').toString();
    const newPassword = (body.newPassword ?? '').toString();

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ message: 'New password must be at least 6 characters' }, { status: 400 });
    }

    // principalType がある前提（なければ role で分岐）
    const principalType = (user as any).principalType ?? (user.role === 'AGENT' ? 'AGENCY' : 'USER');

    if (principalType === 'AGENCY') {
      // 代理店のパスワード変更
      const agencyId = (user as any).agencyId ?? user.id;
      const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
      if (!agency) return NextResponse.json({ message: 'Not found' }, { status: 404 });

      // currentPassword が渡っている場合だけ検証（mustChangePassword 初回を想定して緩くする）
      if (currentPassword && agency.passwordHash) {
        const ok = await verifyPassword(currentPassword, agency.passwordHash);
        if (!ok) return NextResponse.json({ message: 'Invalid current password' }, { status: 401 });
      }

      const passwordHash = await hashPassword(newPassword);

      await prisma.agency.update({
        where: { id: agencyId },
        data: {
          passwordHash,
        },
      });

      auditLog('agency.password_changed', { agencyId, userId: user.id });
      return NextResponse.json({ ok: true });
    }

    // 通常ユーザー
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) return NextResponse.json({ message: 'Not found' }, { status: 404 });

    if (currentPassword && dbUser.passwordHash) {
      const ok = await verifyPassword(currentPassword, dbUser.passwordHash);
      if (!ok) return NextResponse.json({ message: 'Invalid current password' }, { status: 401 });
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    auditLog('user.password_changed', { userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
