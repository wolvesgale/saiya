// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { createSession, verifyPassword } from '@/lib/auth';
import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const prisma = getPrisma();
    const { email, password } = await request.json();

    const emailNorm = (email ?? '').toString().trim().toLowerCase();
    const pass = (password ?? '').toString();

    if (!emailNorm || !pass) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
    }

    // 1) まず user を探す
    const user = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (user && user.passwordHash && user.isActive) {
      const ok = await verifyPassword(pass, user.passwordHash);
      if (!ok) return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });

      await createSession(user);

      return NextResponse.json({
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      });
    }

    // 2) user がいなければ agency を探す（= 代理店ログイン）
    const agency = await prisma.agency.findFirst({ where: { email: emailNorm } });
    if (!agency || !agency.passwordHash) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    const ok = await verifyPassword(pass, agency.passwordHash);
    if (!ok) return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });

    // createSession が User 前提なら、lib/auth 側で agency も扱えるようにしてある想定
    // （あなたの実装では createSession が cookie をセットしているはず）
    await createSession({
      id: agency.id,
      email: agency.email,
      role: 'AGENT',
      tenantId: agency.tenantId,
      agencyId: agency.id,
      mustChangePassword: false,
    } as any);

    return NextResponse.json({
      role: 'AGENT',
      mustChangePassword: false,
    });
  } catch (error) {
    console.error('[auth.login] error', error);
    return errorResponse(error);
  }
}
