// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { getPrisma, resolveXruleTenantId } from '@/lib/db';
import { createSession, verifyPassword } from '@/lib/auth';
import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const prisma = getPrisma();
    const body = await request.json().catch(() => ({}));
    const emailValue = (body.email ?? '').toString().trim().toLowerCase();
    const passwordValue = (body.password ?? '').toString();

    if (!emailValue || !passwordValue) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
    }

    // 1) USER（管理者/一般ユーザー）を照合
    const user = await prisma.user.findUnique({ where: { email: emailValue } });
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

        return NextResponse.json({
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        });
      }
    }

    // 2) AGENCY（代理店）を照合（email が unique じゃない前提なので findFirst）
    const agency = await prisma.agency.findFirst({
      where: { email: emailValue },
      orderBy: { createdAt: 'desc' },
    });

    if (!agency || !agency.passwordHash || !agency.isActive) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    const okAgency = await verifyPassword(passwordValue, agency.passwordHash);
    if (!okAgency) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    const tenantId = agency.tenantId ?? (await resolveXruleTenantId(prisma));
    if (!tenantId) {
      return NextResponse.json({ message: 'Tenant required' }, { status: 400 });
    }

    const agencyEmail = agency.email ?? '';
    if (!agencyEmail) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    await createSession({
      principalType: 'AGENCY',
      id: agency.id,
      email: agencyEmail,
      role: 'AGENT',
      tenantId,
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
