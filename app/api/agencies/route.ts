import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getPrisma, resolveXruleTenantId } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { hashPassword } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeTenantId(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  if (!s || s === 'null' || s === 'undefined') return undefined;
  return s;
}

export async function GET(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const url = new URL(request.url);
    const requestedTenantId = normalizeTenantId(url.searchParams.get('tenantId'));
    const tenantId =
      user.role === 'SUPER_ADMIN'
        ? (requestedTenantId ?? (await resolveXruleTenantId(prisma)))
        : (user.tenantId ?? (await resolveXruleTenantId(prisma)));

    const agencies = await prisma.agency.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(agencies);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const payload = await request.json();
    const name = payload.name?.toString().trim();
    const email = payload.email?.toString().trim();
    const requestedTenantId = normalizeTenantId(payload.tenantId);
    const tenantId =
      user.role === 'SUPER_ADMIN'
        ? (requestedTenantId ?? user.tenantId ?? (await resolveXruleTenantId(prisma)))
        : (user.tenantId ?? (await resolveXruleTenantId(prisma)));

    const validationErrors: Array<{ field: string; message: string }> = [];
    if (!tenantId) {
      validationErrors.push({ field: 'tenantId', message: 'Tenant required' });
    }
    if (!name) {
      validationErrors.push({ field: 'name', message: 'Name required' });
    }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      validationErrors.push({ field: 'email', message: 'Email is invalid' });
    }
    if (validationErrors.length > 0) {
      return NextResponse.json({ error: 'validation', details: validationErrors }, { status: 400 });
    }

    const password = payload.initialPassword?.toString() || payload.password?.toString() || randomUUID();
    const passwordHash = await hashPassword(password);

    const agency = await prisma.agency.create({
      data: {
        tenantId,
        name,
        email: email ?? null,
        shopName: payload.shopName ?? null,
        passwordHash,
      },
    });

    return NextResponse.json(agency, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
