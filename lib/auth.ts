// lib/auth.ts
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getPrisma } from '@/lib/db';

// ===== パスワード（PBKDF2） =====
const ITERATIONS = Number(process.env.PASSWORD_ITERATIONS ?? 100000);
const KEYLEN = 64;
const DIGEST = 'sha512';
const PEPPER = process.env.PASSWORD_PEPPER ?? '';

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password + PEPPER, salt, ITERATIONS, KEYLEN, DIGEST)
    .toString('hex');
  // iterations:salt:hash
  return `${ITERATIONS}:${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string) {
  try {
    // PBKDF2形式: "iter:salt:hash"
    const parts = stored.split(':');
    if (parts.length === 3 && /^\d+$/.test(parts[0])) {
      const [iterStr, salt, hash] = parts;
      const iterations = Number(iterStr);
      if (!iterations || !salt || !hash) return false;

      const computed = crypto
        .pbkdf2Sync(password + PEPPER, salt, iterations, KEYLEN, DIGEST)
        .toString('hex');

      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
    }

    // もし既存が bcrypt の可能性がある場合に備えて（依存が無ければ無視）
    if (stored.startsWith('$2')) {
      try {
        const bcrypt = await (0, eval)('import("bcryptjs")');
        return await bcrypt.compare(password, stored);
      } catch {
        return false;
      }
    }

    return false;
  } catch {
    return false;
  }
}

// ===== セッション =====
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

  if (!id || !role) return null;

  // 最低限DB存在チェック（必要なければここは緩めてもOK）
  const prisma = getPrisma();

  if (principalType === 'AGENCY') {
    const agency = await prisma.agency.findUnique({ where: { id } });
    if (!agency || !agency.isActive) return null;
    if (!agency.email) return null;

    return {
      principalType: 'AGENCY',
      id: agency.id,
      email: agency.email,
      role: 'AGENT',
      tenantId: agency.tenantId ?? null,
      agencyId: agency.id,
      mustChangePassword: false,
      isActive: true,
    };
  }

  const userRow = await prisma.user.findUnique({ where: { id } });
  if (!userRow || !userRow.isActive) return null;

  return {
    principalType: 'USER',
    id: userRow.id,
    email: userRow.email,
    role: userRow.role,
    tenantId: userRow.tenantId ?? null,
    agencyId: userRow.agencyId ?? null,
    mustChangePassword: userRow.mustChangePassword ?? false,
    isActive: userRow.isActive ?? true,
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

// ✅ 互換: 既存の change-password 等が import しても落ちない用
export async function getSessionUser(request: Request) {
  const token = getCookieValue(request.headers.get('cookie'), SESSION_COOKIE);
  if (!token) return null;
  return await getSessionUserFromToken(token);
}
