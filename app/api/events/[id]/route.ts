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

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const payload = await request.json();
    const event = await prisma.event.findUnique({ where: { id: params.id } });
    if (!event) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && event.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const startDate = payload.startDate ? new Date(payload.startDate) : event.startDate;
    const endDate = payload.endDate ? new Date(payload.endDate) : event.endDate;
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ message: 'Invalid dates' }, { status: 400 });
    }

    let agencyId = event.agencyId;
    if (payload.agencyId) {
      const agency = await prisma.agency.findUnique({ where: { id: payload.agencyId } });
      if (!agency || agency.tenantId !== event.tenantId) {
        return NextResponse.json({ message: 'Invalid agency' }, { status: 400 });
      }
      agencyId = agency.id;
    }

    let venueId = event.venueId;
    let venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (payload.venueId) {
      const updatedVenue = await prisma.venue.findUnique({ where: { id: payload.venueId } });
      if (!updatedVenue || updatedVenue.tenantId !== event.tenantId) {
        return NextResponse.json({ message: 'Invalid venue' }, { status: 400 });
      }
      venueId = updatedVenue.id;
      venue = updatedVenue;
    }

    let intermediaryId = payload.intermediaryId ?? event.intermediaryId ?? null;
    if (payload.intermediaryId !== undefined) {
      if (payload.intermediaryId === null || payload.intermediaryId === '') {
        intermediaryId = null;
      } else {
        const intermediary = await prisma.intermediary.findUnique({ where: { id: payload.intermediaryId } });
        if (!intermediary || intermediary.tenantId !== event.tenantId) {
          return NextResponse.json({ message: 'Invalid intermediary' }, { status: 400 });
        }
        intermediaryId = intermediary.id;
      }
    }

    const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) return NextResponse.json({ message: 'Invalid agency' }, { status: 400 });

    const updated = await prisma.event.update({
      where: { id: params.id },
      data: {
        title: formatTitle(agency.name, venue?.name ?? '会場未設定', startDate),
        startDate,
        endDate,
        agencyId,
        venueId,
        intermediaryId,
        cashHandling: payload.cashHandling === '' ? null : payload.cashHandling ?? event.cashHandling,
        reportDeadline: payload.reportDeadline === '' ? null : payload.reportDeadline ?? event.reportDeadline,
      },
    });

    if (payload.startDate || payload.endDate) {
      await prisma.eventDay.deleteMany({ where: { eventId: event.id } });
      const days = buildDays(startDate, endDate).map((date) => ({
        tenantId: event.tenantId,
        eventId: event.id,
        date,
      }));
      await prisma.eventDay.createMany({ data: days });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const event = await prisma.event.findUnique({
      where: { id: params.id },
      include: { agency: true, venue: true, intermediary: true },
    });
    if (!event) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && event.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      id: event.id,
      title: event.title,
      startDate: event.startDate.toISOString().slice(0, 10),
      endDate: event.endDate.toISOString().slice(0, 10),
      agencyId: event.agencyId,
      agencyName: event.agency?.name ?? null,
      venueId: event.venueId,
      venueName: event.venue?.name ?? null,
      intermediaryId: event.intermediaryId ?? null,
      intermediaryName: event.intermediary?.name ?? null,
      intermediaryReportFormUrl: event.intermediary?.reportFormUrl ?? null,
      memo: event.memo ?? null,
      cashHandling: event.cashHandling ?? event.venue?.cashHandling ?? null,
      reportDeadline: event.reportDeadline ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const event = await prisma.event.findUnique({ where: { id: params.id } });
    if (!event) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && event.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    await prisma.eventDay.deleteMany({ where: { eventId: event.id } });
    await prisma.event.delete({ where: { id: params.id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
