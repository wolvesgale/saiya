import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { createSession, verifyPassword } from '@/lib/auth';
import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const prisma = getPrisma();
    const body = await request.json().catch(() => ({}));
    const emailValue = String(body?.email ?? '').trim().toLowerCase();
    const passwordValue = String(body?.password ?? '');

    if (!emailValue || !passwordValue) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
    }

    // =========================
    // 緊急バイパス（必要なら使う）
    // =========================
    const emEmail = (process.env.EMERGENCY_ADMIN_EMAIL ?? '').trim().toLowerCase();
    const emPass = process.env.EMERGENCY_ADMIN_PASSWORD ?? '';
    if (emEmail && emPass && emailValue === emEmail && passwordValue === emPass) {
      const u = await prisma.user.findFirst({ where: { email: emailValue } });
      if (u && u.isActive) {
        await createSession({
          principalType: 'USER',
          id: u.id,
          email: u.email,
          role: u.role,
          tenantId: u.tenantId ?? null,
          agencyId: u.agencyId ?? null,
          mustChangePassword: u.mustChangePassword ?? false,
          isActive: u.isActive ?? true,
        });

        return NextResponse.json({ role: u.role, mustChangePassword: u.mustChangePassword ?? false });
      }
      // バイパス対象メールなのにユーザーが居ない場合は通常処理へ落とす
    }

    // 1) USER（管理者含む）
    const user = await prisma.user.findFirst({ where: { email: emailValue } });
    if (user && user.passwordHash && user.isActive) {
      const ok = await verifyPassword(passwordValue, user.passwordHash);
      if (ok) {
        await createSession({
          principalType: 'USER',
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId ?? null,
          agencyId: user.agencyId ?? null,
          mustChangePassword: user.mustChangePassword ?? false,
          isActive: user.isActive ?? true,
        });

        return NextResponse.json({ role: user.role, mustChangePassword: user.mustChangePassword ?? false });
      }
    }

    // 2) AGENCY（代理店）
    // findUnique(email) は schema 次第で落ちるので findFirst に固定
    const agency = await prisma.agency.findFirst({ where: { email: emailValue } });
    if (agency && agency.passwordHash) {
      const ok = await verifyPassword(passwordValue, agency.passwordHash);
      if (ok) {
        await createSession({
          principalType: 'AGENCY',
          id: agency.id,
          email: emailValue, // agency.email が nullable の可能性があるため、入力値を採用
          role: 'AGENT',
          tenantId: agency.tenantId ?? null,
          agencyId: agency.id,
          mustChangePassword: false,
          isActive: true,
        });

        return NextResponse.json({ role: 'AGENT', mustChangePassword: false });
      }
    }

    return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
  } catch (error) {
    console.error('[auth.login] error', error);
    return errorResponse(error);
  }
}
