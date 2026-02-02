// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { createSessionToken, getSessionCookieName, verifyPassword, SessionUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const prisma = getPrisma();
    const body = await request.json().catch(() => null);
    const emailValue = (body?.email ?? '').toString().trim().toLowerCase();
    const passwordValue = (body?.password ?? '').toString();

    if (!emailValue || !passwordValue) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
    }

    // 1) USER（管理者/一般ユーザー）
    const user = await prisma.user.findUnique({ where: { email: emailValue } });
    if (user && user.passwordHash && user.isActive) {
      const ok = await verifyPassword(passwordValue, user.passwordHash);
      if (!ok) return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });

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

      const { token, expiresAt } = createSessionToken(sessionUser);
      const res = NextResponse.json({ role: sessionUser.role, mustChangePassword: sessionUser.mustChangePassword });
      res.cookies.set(getSessionCookieName(), token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        expires: expiresAt,
      });
      return res;
    }

    // 2) AGENCY（代理店）
    const agency = await prisma.agency.findFirst({ where: { email: emailValue } });
    if (!agency || !agency.passwordHash) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }
    const ok = await verifyPassword(passwordValue, agency.passwordHash);
    if (!ok) return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });

    const sessionUser: SessionUser = {
      principalType: 'AGENCY',
      id: agency.id,
      email: (agency.email ?? emailValue).toString(), // null 回避
      role: 'AGENT',
      tenantId: agency.tenantId ?? null,
      agencyId: agency.id,
      mustChangePassword: false,
      isActive: true,
    };

    const { token, expiresAt } = createSessionToken(sessionUser);
    const res = NextResponse.json({ role: sessionUser.role, mustChangePassword: sessionUser.mustChangePassword });
    res.cookies.set(getSessionCookieName(), token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
    return res;
  } catch (error) {
    console.error('[auth.login] error', error);
    return errorResponse(error);
  }
}
