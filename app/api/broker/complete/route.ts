import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN', 'BROKER']);
    if (roleResponse) return roleResponse;

    const payload = await request.json();
    const event = await prisma.event.findUnique({ where: { id: payload.eventId } });
    if (!event) return NextResponse.json({ message: 'Event not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && event.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const date = new Date(payload.date);

    const eventDay = await prisma.eventDay.upsert({
      where: { eventId_date: { eventId: event.id, date } },
      update: { brokerCompleted: true },
      create: { tenantId: event.tenantId, eventId: event.id, date, brokerCompleted: true },
    });

    auditLog('broker.completed', { eventDayId: eventDay.id, userId: user.id });

    return NextResponse.json(eventDay);
  } catch (error) {
    return errorResponse(error);
  }
}
