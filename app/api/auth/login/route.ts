// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { createSession, verifyPassword } from '@/lib/auth';
import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const prisma = getPrisma();
    const body = await request.json().catch(() => ({}));
    const emailValue = (body.email ?? '').toString().trim().toLowerCase();
    const password = (body.password ?? '').toString();

    if (!emailValue || !password) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
    }

    // 1) USER（管理者/社内ユーザー）
    const user = await prisma.user.findUnique({ where: { email: emailValue } });
    if (user && user.passwordHash && user.isActive) {
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });

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

      return NextResponse.json({
        role: user.role,
        mustChangePassword: user.mustChangePassword ?? false,
      });
    }

    // 2) AGENCY（代理店）
    // email が unique でない想定なので findFirst を使う
    const agency = await prisma.agency.findFirst({
      where: { email: emailValue },
      orderBy: { createdAt: 'desc' },
    });

    if (!agency || !agency.passwordHash) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    // nullable対策（ここがビルドで落ちてた箇所）
    const agencyEmail = (agency.email ?? '').toString();
    if (!agencyEmail) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    const okAgency = await verifyPassword(password, agency.passwordHash);
    if (!okAgency) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    await createSession({
      principalType: 'AGENCY',
      id: agency.id,
      email: agencyEmail,
      role: 'AGENT',
      tenantId: agency.tenantId ?? null,
      agencyId: agency.id,
      mustChangePassword: false,
      isActive: true,
    });

    return NextResponse.json({
      role: 'AGENT',
      mustChangePassword: false,
    });
  } catch (error) {
    console.error('[auth.login] error', error);
    return errorResponse(error);
  }
}
