// lib/auth.ts
import crypto from 'crypto';
import { getPrisma } from '@/lib/db';

// ===== Types =====
export type PrincipalType = 'USER' | 'AGENCY';

export type SessionUser = {
  id: string;
  email: string;
  role: string; // SUPER_ADMIN | ADMIN | AGENT ...
  tenantId: string | null;
  agencyId: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  principalType: PrincipalType;
};

// ===== Password =====
const ITERATIONS = Number(process.env.PASSWORD_ITERATIONS ?? 100000);
const KEYLEN = 64;
const DIGEST = 'sha512';
const PEPPER = process.env.PASSWORD_PEPPER ?? '';

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password + PEPPER, salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');
  // 互換性のため "iter:salt:hash" 形式
  return `${ITERATIONS}:${salt}:${hash}`;
}

/**
 * 互換対応：
 * - "iter:salt:hash"
 * - "salt:iter:hash"（過去実装がこうだった場合にも通す）
 */
export async function verifyPassword(password: string, stored: string) {
  try {
    const parts = stored.split(':');
    if (parts.length < 3) return false;

    let iterations = 0;
    let salt = '';
    let hash = '';

    // 1) iter:salt:hash
    if (/^\d+$/.test(parts[0])) {
      iterations = Number(parts[0]);
      salt = parts[1];
      hash = parts.slice(2).join(':');
    } else if (parts.length >= 3 && /^\d+$/.test(parts[1])) {
      // 2) salt:iter:hash
      salt = parts[0];
      iterations = Number(parts[1]);
      hash = parts.slice(2).join(':');
    } else {
      return false;
    }

    if (!iterations || !salt || !hash) return false;

    const computed = crypto.pbkdf2Sync(password + PEPPER, salt, iterations, KEYLEN, DIGEST).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
  } catch {
    return false;
  }
}

// ===== Session Token (HMAC) =====
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

export function createSessionToken(input: SessionUser) {
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

  return { token, expiresAt };
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';').map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) return decodeURIComponent(part.slice(name.length + 1));
  }
  return null;
}

/**
 * API側の認証統一：cookie -> token verify -> DB確認 -> SessionUser
 * （DB確認を入れることで、削除/停止ユーザーを弾ける）
 */
export async function getSessionUserFromRequest(request: Request): Promise<SessionUser | null> {
  const token = getCookieValue(request.headers.get('cookie'), SESSION_COOKIE);
  if (!token) return null;

  const decoded = verify(token);
  if (!decoded) return null;

  const exp = decoded.exp ? new Date(decoded.exp) : null;
  if (!exp || Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) return null;

  const principalType: PrincipalType = decoded.principalType === 'AGENCY' ? 'AGENCY' : 'USER';
  const sub = (decoded.sub ?? '').toString();
  const role = (decoded.role ?? '').toString();
  if (!sub || !role) return null;

  const prisma = getPrisma();

  if (principalType === 'AGENCY') {
    const agency = await prisma.agency.findUnique({ where: { id: sub } });
    if (!agency) return null;
    // agency.email が null の可能性があるので token 側 email を fallback
    const email = (agency.email ?? decoded.email ?? '').toString();
    if (!email) return null;
    return {
      principalType: 'AGENCY',
      id: agency.id,
      email,
      role: 'AGENT',
      tenantId: agency.tenantId ?? null,
      agencyId: agency.id,
      mustChangePassword: false,
      isActive: true,
    };
  }

  const user = await prisma.user.findUnique({ where: { id: sub } });
  if (!user || !user.isActive) return null;

  return {
    principalType: 'USER',
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId ?? null,
    agencyId: user.agencyId ?? null,
    mustChangePassword: user.mustChangePassword ?? false,
    isActive: user.isActive ?? true,
  };
}
