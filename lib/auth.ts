// lib/auth.ts
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getPrisma } from '@/lib/db';

// ===== Password hashing (PBKDF2) =====
const DEFAULT_ITERATIONS = 100000;
const ITERATIONS = Number(process.env.PASSWORD_ITERATIONS ?? DEFAULT_ITERATIONS);
const KEYLEN = 64;
const DIGEST = 'sha512';
const PEPPER = process.env.PASSWORD_PEPPER ?? '';

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = Number.isFinite(ITERATIONS) && ITERATIONS > 0 ? ITERATIONS : DEFAULT_ITERATIONS;

  const hash = crypto
    .pbkdf2Sync(password + PEPPER, salt, iterations, KEYLEN, DIGEST)
    .toString('hex');

  // 互換性のため "iter:salt:hash" 形式
  return `${iterations}:${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string) {
  try {
    if (!stored) return false;

    const parts = stored.split(':');

    // 互換: iter:salt:hash  or  salt:iter:hash
    let iterations: number | null = null;
    let salt: string | null = null;
    let hash: string | null = null;

    if (parts.length === 3) {
      const [p1, p2, p3] = parts;

      // iter:salt:hash
      if (/^\d+$/.test(p1)) {
        iterations = Number(p1);
        salt = p2;
        hash = p3;
      }
      // salt:iter:hash
      else if (/^\d+$/.test(p2)) {
        iterations = Number(p2);
        salt = p1;
        hash = p3;
      }
    } else if (parts.length === 2) {
      // 互換: salt:hash（昔こうしてた場合の救済）
      salt = parts[0];
      hash = parts[1];
      iterations = Number.isFinite(ITERATIONS) && ITERATIONS > 0 ? ITERATIONS : DEFAULT_ITERATIONS;
    } else {
      return false;
    }

    if (!iterations || iterations <= 0 || !salt || !hash) return false;

    const computed = crypto
      .pbkdf2Sync(password + PEPPER, salt, iterations, KEYLEN, DIGEST)
      .toString('hex');

    // timingSafeEqual は長さ一致が必要
    if (computed.length !== hash.length) return false;

    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
  } catch {
    return false;
  }
}

// ===== Session =====
export type PrincipalType = 'USER' | 'AGENCY';

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
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  const json = Buffer.from(body, 'base64url').toString('utf-8');
  return JSON.parse(json) as any;
}

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
  const mustChangePassword = Boolean(decoded.mustChangePassword ?? false);

  if (!id || !role || !email) return null;

  const prisma = getPrisma();

  if (principalType === 'AGENCY') {
    const agency = await prisma.agency.findUnique({ where: { id } });
    if (!agency) return null;

    return {
      principalType: 'AGENCY',
      id: agency.id,
      email: (agency.email ?? email).toString(), // nullable対策
      role: 'AGENT',
      tenantId: agency.tenantId ?? tenantId,
      agencyId: agency.id,
      mustChangePassword: false,
      isActive: true,
    };
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || !user.isActive) return null;

  return {
    principalType: 'USER',
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId ?? null,
    agencyId: user.agencyId ?? null,
    mustChangePassword: user.mustChangePassword ?? mustChangePassword,
    isActive: user.isActive ?? true,
  };
}

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';').map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) return decodeURIComponent(part.slice(name.length + 1));
  }
  return null;
}

// 互換: 既存コードが import しても落ちない
export async function getSessionUser(request: Request) {
  const token = getCookieValue(request.headers.get('cookie'), SESSION_COOKIE);
  if (!token) return null;
  return await getSessionUserFromToken(token);
}
