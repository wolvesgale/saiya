// lib/auth.ts
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getPrisma } from '@/lib/db';

// パスワード関連はそのまま…

// PrincipalType と SessionUser を定義
type PrincipalType = 'USER' | 'AGENCY';

export type SessionUser = {
  id: string;
  email: string;               // null の可能性は外で '' に補正して渡す
  role: string;
  tenantId: string | null;
  agencyId: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  principalType: PrincipalType;
};

const SESSION_COOKIE = 'saiya_session';
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 14);
const SESSION_SECRET = process.env.SESSION_SECRET ?? '';

// … sign/verify の実装はそのまま …

export async function createSession(input: SessionUser) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const token = sign({
    sub: input.id,
    principalType: input.principalType,
    role: input.role,
    tenantId: input.tenantId,
    agencyId: input.agencyId,
    email: input.email,
    mustChangePassword: input.mustChangePassword,
    exp: expiresAt.toISOString(),
  });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  return token;
}

// getSessionUserFromToken はそのまま。ただし principalType を反映する。
// getSessionUser は getSessionUserFromToken を薄くラップする。
export async function getSessionUser(request: Request) {
  const cookieHeader = request.headers.get('cookie');
  const token = cookieHeader
    ?.split(';')
    .map((p) => p.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;
  return await getSessionUserFromToken(token);
}
