import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { getPrisma } from '@/lib/db';
import type { User, UserRole } from '@prisma/client';

const SESSION_COOKIE = 'saiya_session';
const SESSION_TTL_HOURS = 24 * 7;

export type SessionUser = {
  id: string;
  tenantId: string | null;
  role: UserRole;
  email: string;
  mustChangePassword: boolean;
  agencyId: string | null;
};

export async function createSession(user: User) {
  const prisma = getPrisma();
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      id: token,
      userId: user.id,
      expiresAt,
    },
  });

  cookies().set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSession() {
  const prisma = getPrisma();
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.delete({ where: { id: token } }).catch(() => undefined);
  }
  cookies().set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
}

export async function getSessionUserFromToken(token: string): Promise<SessionUser | null> {
  const prisma = getPrisma();
  const session = await prisma.session.findUnique({
    where: { id: token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) {
    return null;
  }
  const user = session.user;
  return {
    id: user.id,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email,
    mustChangePassword: user.mustChangePassword,
    agencyId: user.agencyId,
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUserFromToken(token);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function assertRole(user: SessionUser, allowed: UserRole[]) {
  if (!allowed.includes(user.role)) {
    const error = new Error('Forbidden');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}
