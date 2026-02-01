import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';

export const runtime = 'nodejs';

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
      intermediaryId: event.intermediaryId ?? null,
      intermediaryName: event.intermediary?.name ?? null,
      intermediaryReportFormUrl: event.intermediary?.reportFormUrl ?? null,
      memo: event.memo ?? null,
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

    const startDate = new Date(payload.startDate);
    const endDate = new Date(payload.endDate);

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
        agencyId: payload.agencyId ?? null,
        venueId: payload.venueId ?? null,
        intermediaryId,
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
