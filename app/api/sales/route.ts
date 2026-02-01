import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { appendDailySales } from '@/lib/googleSheets';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const prisma = getPrisma();
  const { user, response } = await requireSession(request);
  if (response) return response;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const tenantId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('tenantId') ?? undefined : user.tenantId ?? undefined;

  if (user.role === 'AGENT' && !user.agencyId) {
    return NextResponse.json([]);
  }

  const sales = await prisma.sale.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ...(user.role === 'AGENT' ? { agencyId: user.agencyId ?? undefined } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(sales);
}

export async function POST(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN', 'AGENT']);
    if (roleResponse) return roleResponse;

    const payload = await request.json();
    const event = await prisma.event.findUnique({ where: { id: payload.eventId } });
    if (!event) return NextResponse.json({ message: 'Event not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && event.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const date = new Date(payload.date);
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ message: 'Date required' }, { status: 400 });
    }
    const amount = Number(payload.amount);
    if (Number.isNaN(amount)) {
      return NextResponse.json({ message: 'Amount required' }, { status: 400 });
    }
    if (user.role === 'AGENT') {
      if (!user.agencyId) {
        return NextResponse.json({ message: 'Agency required' }, { status: 403 });
      }
      if (event.agencyId !== user.agencyId) {
        return NextResponse.json({ message: 'Cannot submit sales for another agency' }, { status: 403 });
      }
    }
    if (!event.agencyId) {
      return NextResponse.json({ message: 'Event agency required for sales' }, { status: 400 });
    }

    const existing = await prisma.sale.findUnique({
      where: { eventId_date: { eventId: event.id, date } },
    });
    if (existing) {
      return NextResponse.json({ message: 'Sales already submitted for this date' }, { status: 409 });
    }

    const sale = await prisma.sale.create({
      data: {
        tenantId: event.tenantId,
        eventId: event.id,
        agencyId: event.agencyId,
        date,
        amount,
      },
    });

    const [agency, venue] = await Promise.all([
      prisma.agency.findUnique({ where: { id: event.agencyId } }),
      prisma.venue.findUnique({ where: { id: event.venueId } }),
    ]);
    if (agency && venue) {
      appendDailySales(agency.name, venue.name, date, amount).catch((error) => {
        console.error('[googleSheets] append failed', error);
      });
    }

    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
