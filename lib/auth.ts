// lib/auth.ts
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getPrisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';

// ===== パスワード =====
const ITERATIONS = Number(process.env.PASSWORD_ITERATIONS ?? 100000);
const KEYLEN = 64;
const DIGEST = 'sha512';
const PEPPER = process.env.PASSWORD_PEPPER ?? '';

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password + PEPPER, salt, ITERATIONS, KEYLEN, DIGEST)
    .toString('hex');

  // 既存の verifyPassword 実装に合わせている前提。
  // もし DB 側が "salt:iter:hash" 形式ならそこへ合わせてください。
  return `${ITERATIONS}:${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string) {
  try {
    const [iterStr, salt, hash] = stored.split(':');
    const iterations = Number(iterStr);
    if (!iterations || !salt || !hash) return false;

    const computed = crypto
      .pbkdf2Sync(password + PEPPER, salt, iterations, KEYLEN, DIGEST)
      .toString('hex');

    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
  } catch {
    return false;
  }
}

// ===== セッション =====
type PrincipalType = 'USER' | 'AGENCY';

export type SessionUser = {
  id: string;
  email: string;
  role: string; // 'SUPER_ADMIN' | 'ADMIN' | 'AGENT' etc
  tenantId: string | null;
  agencyId: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  principalType: PrincipalType;
};

type CreateSessionInput = SessionUser;

const SESSION_COOKIE = 'saiya_session';
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 14);
const SESSION_SECRET = process.env.SESSION_SECRET ?? '';

function assertSessionSecret() {
  if (!SESSION_SECRET) {
    throw Object.assign(new Error('SESSION_SECRET is missing'), { status: 500 });
  }
}

function sign(payload: object) {
  assertSessionSecret();
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token: string) {
  assertSessionSecret();
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const json = Buffer.from(body, 'base64url').toString('utf-8');
  return JSON.parse(json) as any;
}

export async function createSession(input: CreateSessionInput) {
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

  // Route Handler から cookies() で Set-Cookie 可能（Next.js 標準）:contentReference[oaicite:1]{index=1}
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });

  return token;
}

export async function getSessionUserFromToken(token: string): Promise<SessionUser | null> {
  const decoded = verify(token);
  if (!decoded) return null;

  const exp = decoded.exp ? new Date(decoded.exp) : null;
  if (!exp || Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) return null;

  const principalType: PrincipalType = decoded.principalType === 'AGENCY' ? 'AGENCY' : 'USER';
  const role = (decoded.role ?? '').toString();
  const tenantId = decoded.tenantId ? decoded.tenantId.toString() : null;
  const agencyId = decoded.agencyId ? decoded.agencyId.toString() : null;
  const id = (decoded.sub ?? '').toString();
  const email = (decoded.email ?? '').toString();

  if (!id || !role) return null;

  // DB の現物が消されていないか最低限チェック（ここを外すなら true を返すだけでも良い）
  const prisma = getPrisma();

  if (principalType === 'AGENCY') {
    const agency = await prisma.agency.findUnique({ where: { id } });
    if (!agency) return null;
    return {
      principalType: 'AGENCY',
      id,
      email: agency.email,
      role: 'AGENT',
      tenantId: agency.tenantId,
      agencyId: agency.id,
      mustChangePassword: false,
      isActive: true,
    };
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || !user.isActive) return null;

  return {
    principalType: 'USER',
    id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId ?? null,
    agencyId: user.agencyId ?? null,
    mustChangePassword: user.mustChangePassword ?? false,
    isActive: user.isActive ?? true,
  };
}

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';').map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) {
      return decodeURIComponent(part.slice(name.length + 1));
    }
  }
  return null;
}

// ✅ 互換: change-password 等が import しても落ちないようにする
export async function getSessionUser(request: Request) {
  const token = getCookieValue(request.headers.get('cookie'), 'saiya_session');
  if (!token) return null;
  return await getSessionUserFromToken(token);
}
