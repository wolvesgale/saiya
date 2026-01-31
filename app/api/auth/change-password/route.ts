import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser, hashPassword } from '@/lib/auth';
import { auditLog } from '@/lib/audit';

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { password } = await request.json();
  if (!password || password.length < 8) {
    return NextResponse.json({ message: 'Password must be at least 8 characters' }, { status: 400 });
  }
  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });
  auditLog('user.password_changed', { userId: user.id });
  return NextResponse.json({ ok: true });
}
