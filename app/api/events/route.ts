import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';

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
  const { user, response } = await requireSession();
  if (response) return response;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const tenantId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('tenantId') ?? undefined : user.tenantId ?? undefined;

  const events = await prisma.event.findMany({
    where: tenantId ? { tenantId } : {},
    include: { agency: true, venue: true },
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
    }))
  );
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireSession();
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const payload = await request.json();
    const tenantId = user.role === 'SUPER_ADMIN' ? payload.tenantId ?? user.tenantId : user.tenantId;
    if (!tenantId) return NextResponse.json({ message: 'Tenant required' }, { status: 400 });

    const startDate = new Date(payload.startDate);
    const endDate = new Date(payload.endDate);

    const event = await prisma.event.create({
      data: {
        tenantId,
        agencyId: payload.agencyId ?? null,
        venueId: payload.venueId ?? null,
        title: payload.title,
        startDate,
        endDate,
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
