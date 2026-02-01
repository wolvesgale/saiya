import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { createSession, verifyPassword } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const prisma = getPrisma();
  const { email, password } = await request.json();
  if (!email || !password) {
    return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
  }

  await createSession(user);

  return NextResponse.json({
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  });
}
