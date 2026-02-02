import { NextResponse } from 'next/server';
import { getPrisma, resolveXruleTenantId } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';

export const runtime = 'nodejs';

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

    const url = new URL(request.url);
    const requestedTenantId = normalizeTenantId(url.searchParams.get('tenantId'));

    // ✅ tenantId を必ず決める（SUPER_ADMINはクエリ優先、なければXruleにフォールバック）
    const tenantId =
      user.role === 'SUPER_ADMIN'
        ? (requestedTenantId ?? (await resolveXruleTenantId(prisma)))
        : (user.tenantId ?? (await resolveXruleTenantId(prisma)));

    if (user.role === 'AGENT' && !user.agencyId) {
      return NextResponse.json([]);
    }

    let venueIds: string[] | undefined;
    if (user.role === 'AGENT' && user.agencyId) {
      const events = await prisma.event.findMany({
        where: { tenantId, agencyId: user.agencyId },
        select: { venueId: true },
      });
      venueIds = Array.from(new Set(events.map((event) => event.venueId)));
    }

    const venues = await prisma.venue.findMany({
      where: {
        tenantId,
        ...(venueIds ? { id: { in: venueIds } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(venues);
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

    const requestedTenantId = normalizeTenantId(payload?.tenantId);
    const tenantId =
      user.role === 'SUPER_ADMIN'
        ? (requestedTenantId ?? user.tenantId ?? (await resolveXruleTenantId(prisma)))
        : (user.tenantId ?? (await resolveXruleTenantId(prisma)));

    if (!tenantId) {
      return NextResponse.json({ message: 'Tenant required' }, { status: 400 });
    }

    const name = payload?.name?.toString().trim();
    if (!name) {
      return NextResponse.json({ message: 'Name required' }, { status: 400 });
    }

    const venue = await prisma.venue.create({
      data: {
        tenantId,
        name,
        address: payload.address ?? null,
        note: payload.note ?? null,
        attachmentUrl: payload.attachmentUrl ?? null,
        phone: payload.phone ?? null,
        contactName: payload.contactName ?? null,
        trashRule: payload.trashRule ?? null,
        cashHandling: payload.cashHandling ?? null,
        notes: payload.notes ?? null,
        hours: payload.hours ?? null,
        workWindow: payload.workWindow ?? null,
        loadInTime: payload.loadInTime ?? null,
        loadOutTime: payload.loadOutTime ?? null,
        preContactRequired: payload.preContactRequired ?? false,
        brokerNote: payload.brokerNote ?? null,
      },
    });

    return NextResponse.json(venue, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
