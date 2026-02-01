import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const payload = await request.json();
    const venue = await prisma.venue.findUnique({ where: { id: params.id } });
    if (!venue) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && venue.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const updated = await prisma.venue.update({
      where: { id: params.id },
      data: {
        name: payload.name ?? venue.name,
        address: payload.address ?? venue.address,
        phone: payload.phone ?? venue.phone,
        contactName: payload.contactName ?? venue.contactName,
        trashRule: payload.trashRule ?? venue.trashRule,
        cashHandling: payload.cashHandling ?? venue.cashHandling,
        notes: payload.notes ?? venue.notes,
        hours: payload.hours ?? venue.hours,
        workWindow: payload.workWindow ?? venue.workWindow,
        loadInTime: payload.loadInTime ?? venue.loadInTime,
        loadOutTime: payload.loadOutTime ?? venue.loadOutTime,
        preContactRequired: payload.preContactRequired ?? venue.preContactRequired,
        brokerNote: payload.brokerNote ?? venue.brokerNote,
        agencyId: payload.agencyId ?? venue.agencyId,
      },
    });

    auditLog('venue.updated', { venueId: updated.id, userId: user.id });

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const venue = await prisma.venue.findUnique({ where: { id: params.id } });
    if (!venue) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && venue.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    await prisma.venue.delete({ where: { id: params.id } });
    auditLog('venue.deleted', { venueId: params.id, userId: user.id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
