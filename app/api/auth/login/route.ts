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
    const email = (body.email ?? '').toString().trim().toLowerCase();
    const password = (body.password ?? '').toString();

    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
    }

    // 1) まずは user（管理者/一般ユーザー）で認証
    const user = await prisma.user.findUnique({ where: { email } });

    if (user && user.passwordHash && user.isActive) {
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) {
        return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
      }

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

    // 2) user で見つからない/ログイン不可なら agency（代理店）で認証
    const agency = await prisma.agency.findUnique({ where: { email } });

    // agency 側に isActive が無い設計ならここは tenantId/passwordHash だけで判定
    if (!agency || !agency.passwordHash || !agency.tenantId) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    const ok = await verifyPassword(password, agency.passwordHash);
    if (!ok) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    await createSession({
      principalType: 'AGENCY',
      id: agency.id,
      email: agency.email,
      role: 'AGENT',
      tenantId: agency.tenantId,
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
