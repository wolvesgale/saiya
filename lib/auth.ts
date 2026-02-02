// lib/auth.ts
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getPrisma } from '@/lib/db';
import bcrypt from 'bcryptjs';

// ===== Types =====
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

// ===== Password hashing (PBKDF2 + bcrypt互換) =====
const DEFAULT_ITERATIONS = 100000;
const ITERATIONS = Number(process.env.PASSWORD_ITERATIONS ?? DEFAULT_ITERATIONS);
const KEYLEN = 64;
const DIGEST = 'sha512';
const PEPPER = process.env.PASSWORD_PEPPER ?? '';

function pbkdf2Hex(password: string, salt: string, iterations: number, pepper: string) {
  return crypto.pbkdf2Sync(password + pepper, salt, iterations, KEYLEN, DIGEST).toString('hex');
}

function safeEqualHex(a: string, b: string) {
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * 返却形式：iterations:salt:hash
 */
export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = Number.isFinite(ITERATIONS) && ITERATIONS > 0 ? ITERATIONS : DEFAULT_ITERATIONS;
  const hash = pbkdf2Hex(password, salt, iterations, PEPPER);
  return `${iterations}:${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string) {
  try {
    if (!stored) return false;

    // ✅ bcrypt互換（DBに $2a$... が入っているケース）
    if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
      // pepper付きでbcryptしていた可能性も潰す（後方互換）
      if (PEPPER) {
        const okPepper = await bcrypt.compare(password + PEPPER, stored);
        if (okPepper) return true;
      }
      return await bcrypt.compare(password, stored);
    }

    // PBKDF2（iter:salt:hash or salt:iter:hash 互換）
    const parts = stored.split(':');
    if (parts.length !== 3) return false;

    let iterations = Number(parts[0]);
    let salt = parts[1];
    let hash = parts[2];

    // salt:iter:hash の可能性
    if (!Number.isFinite(iterations) || iterations <= 0) {
      const iter2 = Number(parts[1]);
      const salt2 = parts[0];
      const hash2 = parts[2];
      if (!Number.isFinite(iter2) || iter2 <= 0) return false;
      iterations = iter2;
      salt = salt2;
      hash = hash2;
    }

    const computed1 = pbkdf2Hex(password, salt, iterations, PEPPER);
    if (safeEqualHex(hash, computed1)) return true;

    // pepper後付け互換（pepper無しでも確認）
    if (PEPPER) {
      const computed2 = pbkdf2Hex(password, salt, iterations, '');
      if (safeEqualHex(hash, computed2)) return true;
    }

    return false;
  } catch {
    return false;
  }
}

// ===== Session =====
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
      email: String(agency.email ?? email), // nullable対策
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
