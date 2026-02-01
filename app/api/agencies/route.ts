import { NextResponse } from 'next/server';
import { getPrisma, getXruleTenantId } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { hashPassword } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const url = new URL(request.url);
    const requestedTenantId = url.searchParams.get('tenantId') ?? undefined;
    const tenantId = requestedTenantId ?? (await getXruleTenantId(prisma));

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
    const requestedTenantId = payload.tenantId?.toString() || undefined;
    const tenantId = requestedTenantId ?? (await getXruleTenantId(prisma));
    const validationErrors: Array<{ field: string; message: string }> = [];
    if (!tenantId) {
      validationErrors.push({ field: 'tenantId', message: 'Tenant required' });
    }
    if (!name) {
      validationErrors.push({ field: 'name', message: 'Name required' });
    }
    if (!email) {
      validationErrors.push({ field: 'email', message: 'Email required' });
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      validationErrors.push({ field: 'email', message: 'Email is invalid' });
    }
    if (validationErrors.length > 0) {
      return NextResponse.json({ error: 'validation', details: validationErrors }, { status: 400 });
    }

    const password = payload.initialPassword?.toString() || payload.password?.toString() || 'initpass';
    const passwordHash = await hashPassword(password);

    const agency = await prisma.agency.create({
      data: {
        tenantId,
        name,
        email,
        shopName: payload.shopName ?? null,
        passwordHash,
      },
    });

    return NextResponse.json(agency, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
