// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { createSession, verifyPassword, type SessionUser } from '@/lib/auth';
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

    // 1) ユーザー（管理者/社内ユーザー）で照合
    const user = await prisma.user.findUnique({ where: { email: emailValue } });
    if (user && user.passwordHash && user.isActive) {
      const ok = await verifyPassword(passwordValue, user.passwordHash);
      if (!ok) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
      }
      const sessionUser: SessionUser = {
        principalType: 'USER',
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId ?? null,
        agencyId: user.agencyId ?? null,
        mustChangePassword: user.mustChangePassword ?? false,
        isActive: user.isActive ?? true,
      };
      await createSession(sessionUser);
      return NextResponse.json({
        role: user.role,
        mustChangePassword: user.mustChangePassword ?? false,
      });
    }

    // 2) 代理店を照合（Agency.email は unique ではない前提なので findFirst）
    const agency = await prisma.agency.findFirst({
      where: { email: emailValue },
      orderBy: { createdAt: 'desc' },
    });

    if (!agency || !agency.passwordHash) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }
    const okAgency = await verifyPassword(passwordValue, agency.passwordHash);
    if (!okAgency) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    const sessionAgency: SessionUser = {
      principalType: 'AGENCY',
      id: agency.id,
      email: agency.email ?? '',      // null を文字列に
      role: 'AGENT',
      tenantId: agency.tenantId ?? null,
      agencyId: agency.id,
      mustChangePassword: false,
      isActive: true,
    };
    await createSession(sessionAgency);
    return NextResponse.json({
      role: 'AGENT',
      mustChangePassword: false,
    });
  } catch (error) {
    console.error('[auth.login] error', error);
    return errorResponse(error);
  }
}
