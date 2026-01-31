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

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, response } = await requireSession();
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

    const updated = await prisma.event.update({
      where: { id: params.id },
      data: {
        title: payload.title ?? event.title,
        startDate,
        endDate,
        agencyId: payload.agencyId ?? event.agencyId,
        venueId: payload.venueId ?? event.venueId,
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

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, response } = await requireSession();
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
