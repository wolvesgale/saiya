import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';

export const runtime = 'nodejs';

function formatTitle(agencyName: string, venueName: string, startDate: Date) {
  const month = (startDate.getMonth() + 1).toString().padStart(2, '0');
  const day = startDate.getDate().toString().padStart(2, '0');
  return `${agencyName} - ${venueName} - ${month}/${day}`;
}

function buildDays(start: Date, end: Date) {
  const days: Date[] = [];
  const current = new Date(start);
  while (current <= end) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

export async function GET(request: Request) {
  const prisma = getPrisma();
  const { user, response } = await requireSession(request);
  if (response) return response;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const tenantId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('tenantId') ?? undefined : user.tenantId ?? undefined;

  const events = await prisma.event.findMany({
    where: tenantId ? { tenantId } : {},
    include: { agency: true, venue: true, intermediary: true },
    orderBy: { startDate: 'desc' },
  });

  return NextResponse.json(
    events.map((event) => ({
      id: event.id,
      title: event.title,
      startDate: event.startDate.toISOString().slice(0, 10),
      endDate: event.endDate.toISOString().slice(0, 10),
      agencyName: event.agency?.name ?? null,
      venueName: event.venue?.name ?? null,
      agencyId: event.agencyId,
      venueId: event.venueId,
      intermediaryId: event.intermediaryId ?? null,
      intermediaryName: event.intermediary?.name ?? null,
      intermediaryReportFormUrl: event.intermediary?.reportFormUrl ?? null,
      memo: event.memo ?? null,
      cashHandling: event.cashHandling ?? event.venue?.cashHandling ?? null,
      reportDeadline: event.reportDeadline ?? null,
    }))
  );
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
    const tenantId = user.role === 'SUPER_ADMIN' ? payload.tenantId ?? user.tenantId : user.tenantId;
    if (!tenantId) return NextResponse.json({ message: 'Tenant required' }, { status: 400 });

    if (!payload.agencyId || !payload.venueId) {
      return NextResponse.json({ message: 'Agency and venue are required' }, { status: 400 });
    }

    const [agency, venue] = await Promise.all([
      prisma.agency.findUnique({ where: { id: payload.agencyId } }),
      prisma.venue.findUnique({ where: { id: payload.venueId } }),
    ]);
    if (!agency || agency.tenantId !== tenantId) {
      return NextResponse.json({ message: 'Invalid agency' }, { status: 400 });
    }
    if (!venue || venue.tenantId !== tenantId) {
      return NextResponse.json({ message: 'Invalid venue' }, { status: 400 });
    }

    const startDate = new Date(payload.startDate);
    const endDate = new Date(payload.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ message: 'Invalid dates' }, { status: 400 });
    }

    let intermediaryId: string | null = payload.intermediaryId ?? null;
    if (intermediaryId === '') intermediaryId = null;
    if (intermediaryId) {
      const intermediary = await prisma.intermediary.findUnique({ where: { id: intermediaryId } });
      if (!intermediary || intermediary.tenantId !== tenantId) {
        return NextResponse.json({ message: 'Invalid intermediary' }, { status: 400 });
      }
    }

    const event = await prisma.event.create({
      data: {
        tenantId,
        agencyId: agency.id,
        venueId: venue.id,
        intermediaryId,
        title: formatTitle(agency.name, venue.name, startDate),
        startDate,
        endDate,
        cashHandling: payload.cashHandling || venue.cashHandling || null,
        reportDeadline: payload.reportDeadline || '21:00',
      },
    });

    const days = buildDays(startDate, endDate).map((date) => ({
      tenantId,
      eventId: event.id,
      date,
    }));

    await prisma.eventDay.createMany({ data: days });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
